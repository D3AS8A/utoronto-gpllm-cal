/**
 * Alpine.js entrypoint, runs before Alpine.start()
 *
 * Registered here so alpine:init fires before Alpine walks the DOM —
 * required for @astrojs/alpinejs virtual-nav resilience (Safari especially).
 *
 * https://docs.astro.build/en/guides/integrations-guide/alpinejs/
 */

import type { Alpine } from 'alpinejs';
import { createEvent, type DateArray } from 'ics';
import { cellVisual, type CatKey } from './lib/calendar-data';
import {
  buildDescription, courseEventTitle, eventSummary,
  EVENT_ALARMS, EVENT_LOCATION, EVENT_TZ, withTimezone, type EventCourse,
} from './lib/event';

// Filter key → cats mapping. Mirrors FILTERS_CLASSES + FILTERS_EXAMS in
// src/lib/calendar-data.ts. Kept in sync manually; small and easy to spot-check.
const FILTER_KEY_TO_CATS: Record<string, string[]> = {
  reg:       ['reg'],
  makeup:    ['makeup'],
  lmc:       ['lmc'],
  lmb:       ['lmb'],
  alrw:      ['alrw'],
  orient:    ['orient'],
  intensive: ['intc', 'intb'],
  mid:       ['mid'],
  dmid:      ['dmid'],
  fin:       ['fin'],
  dfin:      ['dfin'],
};

function vibrate(ms: number) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ }
}

interface DetailItem {
  name: string;
  time: string;
  swatchStyle: string;
  /** Naive America/Toronto local ISO — null when the session has no set hours. */
  isoStart: string | null;
  isoEnd:   string | null;
  /** Day-level free-form note; embedded in ICS + Google Cal description. */
  note: string | null;
  /** Category this item came from; picks the qualifier on a class's title. */
  cat?: string;
  /** Classes meeting this day. One is folded in; several offer a choice. */
  options?: CourseOption[];
}

interface CourseOption {
  ref: string;
  title: string;
  slot: string;
  isoStart?: string;
  isoEnd?: string;
  slug: string;
}

interface CalendarDetail {
  weekday: string;
  dateLabel: string;
  headBg: string;
  headFg: string;
  note: string | null;
  items: DetailItem[];
}

interface TooltipModel {
  /** Container fade / pointer-events gate. */
  visible: boolean;
  /** True during a lavalamp-style travel — enables position + head-color transitions. */
  travel: boolean;
  /** Anchor below the cell instead of above (used when cell is near top of viewport). */
  below: boolean;
  /** Clamped center-x for the tooltip container, viewport coords. */
  x: number;
  /** Signed px offset of arrow from tooltip center — non-zero when x was clamped away from the anchor. */
  arrow: number;
  /** Top-y of the source cell, viewport coords. Tooltip renders above this. */
  yTop: number;
  /** Bottom-y of the source cell, for below-cell fallback when near top of viewport. */
  yBottom: number;
  /** Double-buffered content — the active slot is shown, the inactive one crossfades out during travel. */
  active: 0 | 1;
  activeIso: string;
  slot0: CalendarDetail | null;
  slot1: CalendarDetail | null;
}

/**
 * America/Toronto DST cutovers within the program calendar range
 * (Sep 2026 – Jul 2027). Events don't happen during the 2am transition
 * window so this coarse date check is safe here.
 */
function torontoOffsetHours(dateStr: string): number {
  return (dateStr >= '2026-11-01' && dateStr <= '2027-03-13') ? -5 : -4;
}

/** Naive Toronto-local ISO → UTC DateArray for the `ics` package. */
function torontoToUtcArray(isoLocal: string): DateArray {
  const dateStr = isoLocal.slice(0, 10);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi]    = isoLocal.slice(11, 16).split(':').map(Number);
  const offset = torontoOffsetHours(dateStr);
  // local = utc + offset  →  utc = local - offset  (offset is negative here)
  const utc = new Date(Date.UTC(y, mo - 1, d, h - offset, mi));
  return [
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
  ];
}

/** "2026-09-08T18:00:00" → "20260908T180000" for Google Calendar's `dates=` param. */
function toGcalStamp(iso: string): string {
  return iso.replace(/[-:]/g, '').slice(0, 15);
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

const FILTER_URL_KEYS: Record<string, string> = {
  reg:       'reg-class',
  makeup:    'makeup-class',
  lmc:       'legal-methods-cdn',
  lmb:       'legal-methods-bus',
  alrw:      'alrw',
  orient:    'orient',
  intensive: 'intensive',
  mid:       'midterms',
  dmid:      'def-midterms',
  fin:       'finals',
  dfin:      'def-finals',
};

const FILTER_URL_KEYS_REV: Record<string, string> = Object.fromEntries(
  Object.entries(FILTER_URL_KEYS).map(([k, v]) => [v, k])
);

const ALL_FILTER_KEYS = Object.keys(FILTER_URL_KEYS);

function allFiltersOn(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const k of ALL_FILTER_KEYS) next[k] = true;
  return next;
}

function readFiltersFromUrl(): Record<string, boolean> | null {
  const p = new URLSearchParams(window.location.search);
  if (!p.has('f')) return null;
  const val = p.get('f')!;
  if (val === 'all') return allFiltersOn();
  if (val === 'none') return {};
  const active = new Set(val.split(',').filter(Boolean));
  const next: Record<string, boolean> = {};
  for (const [urlKey, internal] of Object.entries(FILTER_URL_KEYS_REV)) {
    if (active.has(urlKey)) next[internal] = true;
  }
  return next;
}

function syncFiltersToUrl(filters: Record<string, boolean>) {
  const active: string[] = [];
  for (const key of ALL_FILTER_KEYS) {
    if (filters[key]) active.push(FILTER_URL_KEYS[key]);
  }
  const params = new URLSearchParams(window.location.search);
  if (active.length === ALL_FILTER_KEYS.length) {
    params.set('f', 'all');
  } else if (active.length === 0) {
    params.set('f', 'none');
  } else {
    params.set('f', active.join(','));
  }
  const q = params.toString().replace(/%2C/g, ',');
  const url = q ? `${window.location.pathname}?${q}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

/* ---- Courses page URL state --------------------------------------------- */

/**
 * Friendly names for the concentrations, so a shared link reads
 * ?c=cdn,bus rather than carrying the internal keys.
 */
const CONC_URL_KEYS: Record<string, string> = {
  cl:  'cdn',
  bl:  'bus',
  ilt: 'tech',
};

const ALL_CONC_KEYS = Object.keys(CONC_URL_KEYS);

const SORT_MODES = ['time', 'course'] as const;
type SortMode = (typeof SORT_MODES)[number];
const DEFAULT_SORT: SortMode = 'time';

/**
 * Null when the param is absent, which leaves the page on its all-on default.
 *
 * Every key is written, not just the ones that are on: clearOrShowAll() walks
 * Object.keys(conc), so a sparse object would drop concentrations from the
 * show-all action entirely. The calendar's equivalent can return a sparse one
 * because it iterates its own key list instead.
 */
function readConcFromUrl(): Record<string, boolean> | null {
  const p = new URLSearchParams(window.location.search);
  if (!p.has('c')) return null;
  const val = p.get('c')!;
  const active = new Set(val.split(',').filter(Boolean));
  const all = val === 'all';
  const next: Record<string, boolean> = {};
  for (const key of ALL_CONC_KEYS) {
    next[key] = all || active.has(CONC_URL_KEYS[key]);
  }
  return next;
}

// Anything unrecognised falls back to the default rather than leaving the sort
// pill pointing at a view that doesn't exist
function readSortFromUrl(): SortMode | null {
  const val = new URLSearchParams(window.location.search).get('v');
  return SORT_MODES.includes(val as SortMode) ? (val as SortMode) : null;
}

/**
 * Both params are dropped at their default, so an untouched page keeps a clean
 * /courses/ and a link only ever carries what the reader actually changed.
 */
function syncCoursesToUrl(conc: Record<string, boolean>, sort: SortMode) {
  const active: string[] = [];
  for (const key of ALL_CONC_KEYS) {
    if (conc[key]) active.push(CONC_URL_KEYS[key]);
  }

  const params = new URLSearchParams(window.location.search);

  if (sort === DEFAULT_SORT) params.delete('v');
  else params.set('v', sort);

  if (active.length === ALL_CONC_KEYS.length) params.delete('c');
  else if (active.length === 0) params.set('c', 'none');
  else params.set('c', active.join(','));

  const q = params.toString().replace(/%2C/g, ',');
  // Hash carried through: a #law4024 link switches the view on arrival, and
  // rebuilding the URL from pathname and query alone would drop the anchor it
  // had just been asked to open
  const url = (q ? `${window.location.pathname}?${q}` : window.location.pathname)
    + window.location.hash;
  window.history.replaceState(null, '', url);
}

function triggerDownload(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

/* ---- Courses page filter transitions ------------------------------------ */

/**
 * Runs on the next frame, or after a short wait if that never arrives.
 *
 * requestAnimationFrame does not fire in every context: Safari withholds it in
 * some windows, and any browser throttles it in a background tab. Anything
 * gated on rAF alone risks never running, which is how the sort pill and the
 * nav's blocks ended up stranded at opacity 0 in Safari.
 */
function onNextFrame(fn: () => void) {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    fn();
  };
  requestAnimationFrame(once);
  setTimeout(once, 120);
}

const SORT_FADE = 170;
const FILTER_DURATION = 280;
const FILTER_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

/** The course list is flat now, so cards are the only thing to animate. */
const FILTER_LEVELS = ['.cterm', '.cslot', '.course-card'];

interface FilterMetrics {
  shown: boolean;
  height: number;
  margin: number;
  display: string;
}

type Filterable = HTMLElement & { __filterAnim?: Animation | null };

function isShown(el: HTMLElement): boolean {
  return getComputedStyle(el).display !== 'none';
}

function measure(el: HTMLElement): FilterMetrics {
  const style = getComputedStyle(el);
  const shown = style.display !== 'none';
  return {
    shown,
    height: shown ? el.offsetHeight : 0,
    margin: shown ? parseFloat(style.marginBottom) || 0 : 0,
    display: shown ? style.display : '',
  };
}

function cancelFilterAnim(el: HTMLElement) {
  const target = el as Filterable;
  target.__filterAnim?.cancel();
  target.__filterAnim = null;
  clearFilterStyles(target);
}

function clearFilterStyles(el: HTMLElement) {
  el.style.display = '';
  el.style.overflow = '';
  el.classList.remove('is-filtering');
}

function runFilterAnim(el: HTMLElement, frames: Keyframe[], forcedDisplay?: string) {
  const target = el as Filterable;
  target.classList.add('is-filtering');
  // Held visible by an inline style so it can collapse before CSS hides it
  if (forcedDisplay) target.style.display = forcedDisplay;
  target.style.overflow = 'hidden';

  const anim = target.animate(frames, { duration: FILTER_DURATION, easing: FILTER_EASE });
  target.__filterAnim = anim;
  anim.finished
    .then(() => {
      target.__filterAnim = null;
      clearFilterStyles(target);
    })
    .catch(() => {});
}

function animateFilterIn(el: HTMLElement) {
  const to = measure(el);
  runFilterAnim(el, [
    { height: '0px', marginBottom: '0px', opacity: 0 },
    { height: `${to.height}px`, marginBottom: `${to.margin}px`, opacity: 1 },
  ]);
}

function animateFilterOut(el: HTMLElement, from: FilterMetrics) {
  runFilterAnim(
    el,
    [
      { height: `${from.height}px`, marginBottom: `${from.margin}px`, opacity: 1 },
      { height: '0px', marginBottom: '0px', opacity: 0 },
    ],
    from.display,
  );
}

export default (Alpine: Alpine) => {
  Alpine.data('calendar', () => ({
    filters: {} as Record<string, boolean>,
    classesOpen: true,
    examsOpen: false,
    fbHidden: false,
    detail: null as CalendarDetail | null,
    /** Chosen class per detail item, keyed by item name. Empty = none. */
    courseChoice: {} as Record<string, string>,
    _courseIndex: null as Record<string, EventCourse> | null,
    _cells: null as Record<string, CalendarDetail> | null,
    tooltip: {
      visible: false,
      travel: false,
      below: false,
      x: 0,
      arrow: 0,
      yTop: 0,
      yBottom: 0,
      active: 0 as 0 | 1,
      activeIso: '',
      slot0: null as CalendarDetail | null,
      slot1: null as CalendarDetail | null,
    } as TooltipModel,
    spotlight: {
      active: false,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
    },
    _ttHideTimer: 0 as ReturnType<typeof setTimeout> | 0,
    _ttClearTimer: 0 as ReturnType<typeof setTimeout> | 0,
    _ttEnterRaf: 0 as number,
    _ttRefineRaf: 0 as number,
    _spSrcEl: null as HTMLElement | null,
    _spTrack: null as (() => void) | null,

    init() {
      // Fixed-position tooltip references cell viewport coords; drop it on
      // any scroll/resize so it doesn't hang in a stale spot.
      const drop = () => this.hideTooltip(0);
      window.addEventListener('scroll', drop, { passive: true, capture: true });
      window.addEventListener('resize', drop, { passive: true });

      // Re-clamp the tooltip against the viewport whenever its rendered
      // width changes — the grid-stack slot layout settles across a
      // crossfade so the container's final width isn't known when we
      // first position it.
      const tt = document.getElementById('cal-tooltip');
      if (tt && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (!this.tooltip.visible || !this.tooltip.activeIso) return;
          const anchorX = this.tooltip.x + this.tooltip.arrow;
          this._refineTooltipPosition(this.tooltip.activeIso, anchorX);
        });
        ro.observe(tt);
      }

      const fromUrl = readFiltersFromUrl();
      this.filters = fromUrl !== null ? fromUrl : allFiltersOn();

      // Size all toggle labels in a group to the widest one so their tracks
      // align at a consistent X (rather than being pushed to the cell's edge).
      // Also drive the grid cell min-width from the same measurement so the
      // flex container isn't forced to shrink the label.
      const TOG_FIXED = 14 + 8 + 8 + 26 + 18; // swatch + 2×gap + track + tog padding
      const TOG_PAD = 0; // extra breathing room after label text (on top of 0.5rem flex gap)
      const measureGroup = (group: HTMLElement) => {
        const labels = group.querySelectorAll<HTMLElement>('.toggle-label');
        if (!labels.length) return;
        group.style.removeProperty('--tog-label-w');
        group.style.removeProperty('--tog-cell-w');
        let max = 0;
        labels.forEach((l) => {
          const w = l.getBoundingClientRect().width;
          if (w > max) max = w;
        });
        if (max > 0) {
          const labelW = Math.ceil(max) + TOG_PAD;
          group.style.setProperty('--tog-label-w', `${labelW / 16}rem`);
          group.style.setProperty('--tog-cell-w', `${(labelW + TOG_FIXED) / 16}rem`);
        }
      };
      const measureAll = () => {
        document.querySelectorAll<HTMLElement>('.filter-group.is-open').forEach(measureGroup);
      };
      let measureRaf = 0;
      const scheduleMeasure = () => {
        if (measureRaf) cancelAnimationFrame(measureRaf);
        measureRaf = requestAnimationFrame(() => { measureRaf = 0; measureAll(); });
      };
      scheduleMeasure();
      window.addEventListener('resize', scheduleMeasure, { passive: true });
      if (document.fonts?.ready) document.fonts.ready.then(scheduleMeasure);
      this.$watch('classesOpen', (v: boolean) => { if (v) scheduleMeasure(); });
      this.$watch('examsOpen', (v: boolean) => { if (v) scheduleMeasure(); });

      // Hide filter bar on scroll-down, show on scroll-up — but only once the
      // viewport has scrolled past the first calendar section (FALL). Above
      // that, keep the filter bar in its natural sticky behavior with no
      // transform, so we don't leave a gap where its doc-space used to be.
      const fallEl = document.querySelector<HTMLElement>('#season-fall');
      if (fallEl) {
        let threshold = 0;
        let lastY = window.scrollY;
        const recompute = () => { threshold = fallEl.offsetTop; };
        // Defer initial measure past x-cloak / initial paint so offsetTop is real.
        requestAnimationFrame(recompute);
        window.addEventListener('resize', recompute, { passive: true });
        window.addEventListener('scroll', () => {
          const y = window.scrollY;
          if (!threshold) recompute();
          if (y <= threshold) {
            this.fbHidden = false;
          } else if (y > lastY + 4) {
            this.fbHidden = true;
          } else if (y < lastY - 4) {
            this.fbHidden = false;
          }
          lastY = y;
        }, { passive: true });
      }
    },

    get activeCats(): Set<string> {
      const s = new Set<string>();
      for (const key of Object.keys(this.filters)) {
        if (!this.filters[key]) continue;
        for (const c of FILTER_KEY_TO_CATS[key] ?? []) s.add(c);
      }
      return s;
    },

    get anyFilter(): boolean {
      return Object.values(this.filters).some(Boolean);
    },

    get activeCount(): number {
      return Object.values(this.filters).filter(Boolean).length;
    },

    get isDefault(): boolean {
      return ALL_FILTER_KEYS.every((k) => this.filters[k]);
    },

    /** Dim a cell whose `data-cats` doesn't intersect the active filter set. */
    isDim(catsAttr: string): boolean {
      const cats = (catsAttr || '').split(/\s+/).filter(Boolean);
      if (cats.length === 0) return false;
      const active = this.activeCats;
      if (active.size === 0) return true;
      return !cats.some((c) => active.has(c));
    },

    /**
     * Live visual style for a cell — recomputes when filters change so a class
     * + deferred-exam day only shows the corner split when BOTH categories are
     * currently on. If only one is on, that one's plain style is used.
     */
    cellStyle(catsAttr: string): string {
      const all = ((catsAttr || '').split(/\s+/).filter(Boolean)) as CatKey[];
      if (all.length === 0) return '';
      const active = this.activeCats;
      if (active.size === 0) return '';
      const relevant = all.filter((c) => active.has(c));
      const v = cellVisual(relevant.length ? relevant : all);
      return (
        `background:${v.bg};color:${v.fg};border:${v.border};` +
        (v.outline ? `outline:${v.outline};outline-offset:-0.125rem;` : '') +
        `font-weight:${v.isBold ? '800' : '600'};` +
        `--corner-color:${v.cornerColor ?? 'transparent'};`
      );
    },

    toggle(key: string) {
      vibrate(6);
      this.filters = { ...this.filters, [key]: !this.filters[key] };
      syncFiltersToUrl(this.filters);
    },

    toggleGroup(name: 'classes' | 'exams') {
      const key = name === 'classes' ? 'classesOpen' : 'examsOpen';
      const other = name === 'classes' ? 'examsOpen' : 'classesOpen';
      const next = !this[key];
      this[key] = next;
      if (next && window.matchMedia('(max-width: 45rem)').matches) {
        this[other] = false;
      }
    },

    reset() {
      vibrate(6);
      this.filters = {};
      syncFiltersToUrl(this.filters);
    },

    showAll() {
      vibrate(6);
      this.filters = allFiltersOn();
      syncFiltersToUrl(this.filters);
    },

    clearOrShowAll() {
      if (this.anyFilter) this.reset();
      else this.showAll();
    },

    get clearLabel(): string {
      if (!this.anyFilter) return 'show all';
      if (this.isDefault) return 'clear all';
      const n = this.activeCount;
      return `clear ${n} filter${n === 1 ? '' : 's'}`;
    },

    /**
     * Day payloads, parsed once from the per-month blobs the grid emits. They
     * used to be inlined into each cell's click, mouseenter and focus
     * attributes, which wrote every day into the page three times over.
     */
    cellDetail(iso: string): CalendarDetail | null {
      if (!this._cells) {
        const merged: Record<string, CalendarDetail> = {};
        document.querySelectorAll('script.gp-cells').forEach((el) => {
          Object.assign(merged, JSON.parse(el.textContent || '{}'));
        });
        this._cells = merged;
      }
      return this._cells[iso] ?? null;
    },

    openDetail(detail: CalendarDetail | null, sourceEl?: HTMLElement) {
      if (!detail) return;
      vibrate(9);
      this.detail = detail;
      this.courseChoice = {};
      this.tooltip.visible = false;
      this.tooltip.travel = false;
      this.tooltip.slot0 = null;
      this.tooltip.slot1 = null;
      this.tooltip.activeIso = '';
      if (this._ttHideTimer) { clearTimeout(this._ttHideTimer); this._ttHideTimer = 0; }
      if (this._ttClearTimer) { clearTimeout(this._ttClearTimer); this._ttClearTimer = 0; }
      if (this._ttEnterRaf) { cancelAnimationFrame(this._ttEnterRaf); this._ttEnterRaf = 0; }
      if (this._ttRefineRaf) { cancelAnimationFrame(this._ttRefineRaf); this._ttRefineRaf = 0; }
      this._setSpotlight(sourceEl?.closest('.month-card') as HTMLElement | null);
    },

    closeDetail() {
      this.detail = null;
      this._teardownSpotlight();
    },

    _setSpotlight(monthEl: HTMLElement | null | undefined) {
      this._teardownSpotlight();
      if (!monthEl) return;
      this._spSrcEl = monthEl;
      this._readSpotlightRect();
      this.spotlight.active = true;
      const track = () => this._readSpotlightRect();
      this._spTrack = track;
      window.addEventListener('scroll', track, { passive: true, capture: true });
      window.addEventListener('resize', track, { passive: true });
    },

    _readSpotlightRect() {
      if (!this._spSrcEl) return;
      const r = this._spSrcEl.getBoundingClientRect();
      // Clamp to below the sticky filter bar so the spotlight cutout doesn't
      // extend up into the filter bar area (it would otherwise show a lighter
      // patch on the bar in the source month's column).
      const fb = document.querySelector<HTMLElement>('.filter-bar');
      const topFloor = fb ? Math.max(0, fb.getBoundingClientRect().bottom) : 0;
      const top = Math.max(r.top, topFloor);
      const height = Math.max(0, r.bottom - top);
      this.spotlight.x = r.left;
      this.spotlight.y = top;
      this.spotlight.w = r.width;
      this.spotlight.h = height;
    },

    _teardownSpotlight() {
      this.spotlight.active = false;
      this._spSrcEl = null;
      if (this._spTrack) {
        window.removeEventListener('scroll', this._spTrack, { capture: true } as EventListenerOptions);
        window.removeEventListener('resize', this._spTrack);
        this._spTrack = null;
      }
    },

    /** Head background color for the currently-active slot — reactive so CSS `--tt-head` transitions. */
    get tooltipHeadBg(): string {
      const d = this.tooltip.active === 0 ? this.tooltip.slot0 : this.tooltip.slot1;
      return d?.headBg ?? 'var(--prussian-blue)';
    },

    /**
     * Fine-pointer hover / keyboard-focus preview. Skips touch and coarse
     * pointers so mobile taps go straight to the modal instead of showing
     * a tooltip that a finger can't hover.
     *
     * Two modes:
     *  - Fresh entry (nothing visible): teleport to position, fade in.
     *  - Travel (tooltip already visible from a prior hover): write incoming
     *    detail into the inactive slot, flip active — CSS transitions the
     *    container position and crossfades the two slots. Head-color also
     *    transitions via `--tt-head`.
     *
     * When the anchor axis flips (above ↔ below), we force fresh entry so
     * the arrow doesn't rotate mid-glide.
     */
    showTooltip(iso: string, detail: CalendarDetail | null, rect: DOMRect) {
      if (!detail) return;
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (this._ttHideTimer) { clearTimeout(this._ttHideTimer); this._ttHideTimer = 0; }
      if (this._ttClearTimer) { clearTimeout(this._ttClearTimer); this._ttClearTimer = 0; }

      const belowNext = rect.top < 180;
      const anchorX = rect.left + rect.width / 2;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // Initial clamp uses the max-width budget (17.5rem); a follow-up rAF
      // re-clamps against the ACTUAL rendered width so narrower tooltips
      // (few items) aren't over-inset from the viewport edge.
      const halfWMax = (17.5 * rem) / 2;
      const pad = 0.5 * rem;
      const vw = window.innerWidth;
      const x = Math.max(halfWMax + pad, Math.min(anchorX, vw - halfWMax - pad));
      const arrow = anchorX - x;
      const wasVisible = this.tooltip.visible;
      const arrowFlip = wasVisible && belowNext !== this.tooltip.below;
      const canTravel = wasVisible && !arrowFlip;

      if (canTravel) {
        if (this.tooltip.activeIso === iso) return;
        const nextActive: 0 | 1 = this.tooltip.active === 0 ? 1 : 0;
        if (nextActive === 0) this.tooltip.slot0 = detail;
        else this.tooltip.slot1 = detail;
        this.tooltip.travel = true;
        this.tooltip.active = nextActive;
        this.tooltip.activeIso = iso;
        this.tooltip.below = belowNext;
        this.tooltip.x = x;
        this.tooltip.arrow = arrow;
        this.tooltip.yTop = rect.top;
        this.tooltip.yBottom = rect.bottom;
        this._scheduleTooltipRefine(iso, anchorX);
        return;
      }

      this.tooltip.travel = false;
      this.tooltip.visible = false;
      this.tooltip.active = 0;
      this.tooltip.activeIso = iso;
      this.tooltip.slot0 = detail;
      this.tooltip.slot1 = null;
      this.tooltip.below = belowNext;
      this.tooltip.x = x;
      this.tooltip.arrow = arrow;
      this.tooltip.yTop = rect.top;
      this.tooltip.yBottom = rect.bottom;

      if (this._ttEnterRaf) cancelAnimationFrame(this._ttEnterRaf);
      this._ttEnterRaf = requestAnimationFrame(() => {
        this._ttEnterRaf = requestAnimationFrame(() => {
          this._ttEnterRaf = 0;
          this._refineTooltipPosition(iso, anchorX);
          this.tooltip.visible = true;
        });
      });
    },

    _scheduleTooltipRefine(iso: string, anchorX: number) {
      if (this._ttRefineRaf) cancelAnimationFrame(this._ttRefineRaf);
      // Double-rAF: first frame lets Alpine flush the slot content into the
      // DOM; second frame gives the grid-stack layout a chance to grow to
      // the new max-child width before we measure.
      this._ttRefineRaf = requestAnimationFrame(() => {
        this._ttRefineRaf = requestAnimationFrame(() => {
          this._ttRefineRaf = 0;
          this._refineTooltipPosition(iso, anchorX);
        });
      });
    },

    _refineTooltipPosition(iso: string, anchorX: number) {
      if (this.tooltip.activeIso !== iso) return;
      const el = document.getElementById('cal-tooltip');
      if (!el) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const halfW = el.offsetWidth / 2;
      const pad = 0.5 * rem;
      const vw = window.innerWidth;
      const x = Math.max(halfW + pad, Math.min(anchorX, vw - halfW - pad));
      this.tooltip.x = x;
      this.tooltip.arrow = anchorX - x;
    },

    hideTooltip(delay = 320) {
      if (this._ttHideTimer) clearTimeout(this._ttHideTimer);
      this._ttHideTimer = setTimeout(() => {
        this.tooltip.visible = false;
        this.tooltip.travel = false;
        this.tooltip.activeIso = '';
        this._ttHideTimer = 0;
        if (this._ttClearTimer) clearTimeout(this._ttClearTimer);
        this._ttClearTimer = setTimeout(() => {
          this.tooltip.slot0 = null;
          this.tooltip.slot1 = null;
          this._ttClearTimer = 0;
        }, 180);
      }, delay);
    },

    cancelHideTooltip() {
      if (this._ttHideTimer) { clearTimeout(this._ttHideTimer); this._ttHideTimer = 0; }
      if (this._ttClearTimer) { clearTimeout(this._ttClearTimer); this._ttClearTimer = 0; }
    },

    openTooltipDetail() {
      const d = this.tooltip.active === 0 ? this.tooltip.slot0 : this.tooltip.slot1;
      if (!d) return;
      const cell = this.tooltip.activeIso
        ? document.querySelector<HTMLElement>(`[data-iso="${this.tooltip.activeIso}"]`)
        : null;
      this.openDetail(d, cell ?? undefined);
    },

    /**
     * Window-manager style drag on the detail modal — grab any non-interactive
     * spot (header, date, item text, swatch) and drag to reposition. Uses the
     * standalone `translate` CSS property so it composes with the pop
     * animation's `transform: scale(...)` without fighting it.
     */
    startCardDrag(e: PointerEvent) {
      if (e.button !== 0) return;
      const el = e.currentTarget as HTMLElement;
      const t = e.target as HTMLElement;
      if (t.closest('a, button, input, select, textarea')) return;
      e.preventDefault();

      const parse = (s: string): [number, number] => {
        const p = s.trim().split(/\s+/);
        const n = (v?: string) => (v ? parseFloat(v) : 0) || 0;
        return [n(p[0]), n(p[1])];
      };
      const [baseDx, baseDy] = parse(el.style.translate);
      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        el.style.translate = `${baseDx + (ev.clientX - startX)}px ${baseDy + (ev.clientY - startY)}px`;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.body.style.removeProperty('cursor');
        el.classList.remove('is-dragging');
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'grabbing';
      el.style.animation = 'none';
      el.classList.add('is-dragging');
    },

    /**
     * The course dictionary the page emits once, rather than a copy per cell.
     * Parsed on first use and kept.
     */
    get courseIndex(): Record<string, EventCourse> {
      if (!this._courseIndex) {
        const el = document.getElementById('gp-course-index');
        this._courseIndex = el ? JSON.parse(el.textContent || '{}') : {};
      }
      return this._courseIndex!;
    },

    /**
     * One detail item resolved into the event it would produce. A day that
     * names a single class folds it in unasked; a day that names several waits
     * for a choice and stays generic until it gets one. A chosen class brings
     * its own hours, which is what narrows a Saturday to its actual sitting.
     */
    resolveEvent(item: DetailItem) {
      const options = item.options ?? [];
      const chosen = options.length === 1
        ? options[0]
        : options.find((o) => o.ref === this.courseChoice[item.name]);
      const course = chosen ? this.courseIndex[chosen.ref] ?? null : null;
      return {
        name: course ? courseEventTitle(course, item.cat as CatKey) : item.name,
        isoStart: chosen?.isoStart ?? item.isoStart,
        isoEnd:   chosen?.isoEnd   ?? item.isoEnd,
        description: buildDescription(item.note, course),
        /* Built server-side alongside the static file, so the two cannot
           disagree — and so two runs of one course on the same day resolve to
           their own files rather than sharing the first one's. */
        slug: course ? chosen!.slug : null,
      };
    },

    /** Google Calendar "add event" URL for one detail item. */
    googleCalUrl(item: DetailItem): string | null {
      const e = this.resolveEvent(item);
      if (!e.isoStart || !e.isoEnd) return null;
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: eventSummary(e.name),
        dates: `${toGcalStamp(e.isoStart)}/${toGcalStamp(e.isoEnd)}`,
        ctz: EVENT_TZ,
        location: EVENT_LOCATION,
        details: e.description,
      });
      return `https://calendar.google.com/calendar/render?${params.toString()}`;
    },

    /** Generate a single-event .ics file and trigger a download. */
    downloadIcs(item: DetailItem) {
      this._withIcs(item, (value, filename) => triggerDownload(value, filename));
    },

    /**
     * webcal:// URL to the pre-built static .ics for this event. All iOS/macOS
     * browsers (Safari, Chrome, Firefox, etc.) hand webcal:// off to the OS
     * Calendar handler — Blob URLs only work in Safari.
     */
    appleCalUrl(item: DetailItem): string {
      const e = this.resolveEvent(item);
      if (!e.isoStart) return '';
      const day = e.isoStart.slice(0, 10);
      const slug = e.slug ?? `${day}-${safeFilename(e.name)}`;
      const host = window.location.host;
      return `webcal://${host}/ics/${slug}.ics`;
    },

    _withIcs(item: DetailItem, cb: (value: string, filename: string) => void) {
      const e = this.resolveEvent(item);
      if (!e.isoStart || !e.isoEnd) return;
      vibrate(6);
      createEvent({
        start: torontoToUtcArray(e.isoStart),
        end:   torontoToUtcArray(e.isoEnd),
        startInputType:  'utc',
        startOutputType: 'utc',
        endInputType:    'utc',
        endOutputType:   'utc',
        title: eventSummary(e.name),
        description: e.description,
        location: EVENT_LOCATION,
        alarms: EVENT_ALARMS,
        productId: 'utoronto-gpllm-cal/ics',
        calName: 'UofT GPLLM Calendar',
      }, (error, value) => {
        if (error) { console.error('ics error', error); return; }
        const day = e.isoStart!.slice(0, 10);
        cb(withTimezone(value), `${day}-${safeFilename(e.name)}.ics`);
      });
    },

    /** iOS/iPadOS/macOS: show a dedicated "iCal" CTA that opens the event in Calendar.app. */
    get isApple(): boolean {
      if (typeof navigator === 'undefined') return false;
      const ua = navigator.userAgent;
      // iPadOS 13+ reports Macintosh + touch — include maxTouchPoints > 1 to catch it.
      const iPadMasqueradingAsMac = ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
      return /iPhone|iPad|iPod|Macintosh/.test(ua) || iPadMasqueradingAsMac;
    },
  }));

  /**
   * Courses page: the concentration filter bar.
   *
   * Registered here rather than in the component because alpine:init fires
   * once per session. A component-level listener misses it entirely when the
   * page is reached from another route, leaving x-data="courseFilters"
   * pointing at nothing.
   */
  Alpine.data('courseFilters', () => ({
    conc: { cl: true, bl: true, ilt: true } as Record<string, boolean>,
    /** 'time' follows the weekly schedule; 'course' lists each course once. */
    sort: 'time' as 'course' | 'time',
    sortLeft: 0,
    sortWidth: 0,
    sortReady: false,

    init() {
      // Restored before the first paint below, so the pill snaps straight to
      // the view the link asked for instead of sliding across to it
      const conc = readConcFromUrl();
      if (conc) this.conc = conc;
      const sort = readSortFromUrl();
      if (sort) this.sort = sort;

      this.revealFromHash();

      this.$nextTick(() => {
        this.syncSortPill();
        // Enable the slide only after the first snap, so the pill doesn't
        // travel in from the left on load
        onNextFrame(() => { this.sortReady = true; });
        // Webfonts land after first paint and change the option widths
        document.fonts?.ready.then(() => this.syncSortPill());
      });
    },

    syncSortPill() {
      const active = document.querySelector<HTMLElement>(
        `.sort-options [data-sort="${this.sort}"]`,
      );
      if (active) this.moveSortPill(active);
    },

    moveSortPill(el: HTMLElement) {
      this.sortLeft = el.offsetLeft;
      this.sortWidth = el.offsetWidth;
    },

    /**
     * Both views are in the DOM, so switching is a class change. Fading the
     * pair out and back in hides the swap, and means the height change happens
     * while nothing is visible rather than as a jump.
     */
    setSort(next: 'course' | 'time', el: HTMLElement) {
      this.moveSortPill(el);
      if (next === this.sort) return;

      // Written from `next` rather than waiting on the fade below, so the
      // address bar answers the click straight away
      this.syncUrl(next);

      const views = document.querySelector<HTMLElement>('.courses-views');
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!views || reduced) {
        this.sort = next;
        this.$nextTick(() => this.syncOpenHash());
        return;
      }

      views.style.opacity = '0';
      setTimeout(() => {
        this.sort = next;
        this.$nextTick(() => {
          views.style.opacity = '';
          this.syncOpenHash();
        });
      }, SORT_FADE);
    },

    /**
     * /courses/#law4024 opens that course.
     *
     * The anchor sits on the catalogue copy only — the schedule view lists a
     * twice-taught course twice, and an id has to be unique — so a link has to
     * put that view in play. Both views are always rendered but the inactive
     * one is display:none, and a card filtered out by concentration is too, so
     * neither can be scrolled to until it is actually on the page.
     */
    revealFromHash() {
      const token = decodeURIComponent(location.hash.slice(1));
      if (!token) return;
      const card = document.getElementById(token) as HTMLDetailsElement | null;
      if (!card?.classList.contains('course-card')) return;

      if (this.sort !== 'course') {
        this.sort = 'course';
        this.syncUrl();
      }

      const concs = (card.dataset.conc ?? '').split(/\s+/).filter(Boolean);
      if (concs.length && !concs.some((key) => this.conc[key])) {
        concs.forEach((key) => { this.conc[key] = true; });
        this.syncUrl();
      }

      this.$nextTick(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        // Reuses the delegated summary handler, so the panel opens on the same
        // animated path a click takes
        if (!card.open) card.querySelector<HTMLElement>('.course-summary')?.click();
      });
    },

    /**
     * Mirrors the open card in the address bar, so a course someone opened is
     * a link they can copy.
     *
     * Only when exactly one course is open: two open cards have no single URL
     * between them, and the honest answer is no fragment at all. Counts
     * distinct courses rather than cards, since the schedule view lists a
     * twice-taught course twice, and only visible ones, which drops both the
     * inactive view's cards and anything filtered out.
     *
     * replaceState rather than assigning location.hash: the latter fires
     * hashchange, which would send revealFromHash straight back here.
     */
    syncOpenHash() {
      const cards = [...document.querySelectorAll<HTMLElement>('.course-card')];
      const open = cards.filter((card) => {
        if (card.offsetParent === null) return false;
        const state = card.dataset.state;
        return state ? state === 'open' : (card as HTMLDetailsElement).open;
      });
      const tokens = new Set(open.map((card) => card.dataset.course).filter(Boolean));
      const token = tokens.size === 1 ? [...tokens][0] : '';
      const { pathname, search, hash } = window.location;
      const next = token ? `#${token}` : '';
      if (hash === next) return;
      window.history.replaceState(null, '', `${pathname}${search}${next}`);
    },

    get anyOn(): boolean {
      return Object.values(this.conc).some(Boolean);
    },

    // `sort` is resolved in the body rather than as a parameter default: TS
    // cannot type `this` inside a default in an object-literal method
    syncUrl(sort?: SortMode) {
      syncCoursesToUrl(this.conc, sort ?? this.sort);
    },

    // Sync inside the callback: transition() runs it exactly once whichever
    // path it takes, and only ever after the state has changed
    toggle(key: string) {
      this.transition(() => {
        this.conc[key] = !this.conc[key];
        this.syncUrl();
        // A filter can hide the card the fragment names, so recheck once the
        // change has landed rather than leaving the URL claiming it is open
        this.$nextTick(() => this.syncOpenHash());
      });
    },

    clearOrShowAll() {
      const on = this.anyOn;
      this.transition(() => {
        Object.keys(this.conc).forEach((key) => {
          this.conc[key] = !on;
        });
        this.syncUrl();
        this.$nextTick(() => this.syncOpenHash());
      });
    },

    /**
     * Filtering itself is CSS (see the show-* rules on the courses page), which
     * means elements switch on `display` and can't be transitioned. So measure
     * every filterable element, apply the change, then animate whatever flipped
     * between the two states.
     *
     * Works top down: a term or slot that is disappearing animates as one
     * block, and the cards inside it are left alone rather than animating
     * twice over.
     */
    transition(mutate: () => void) {
      // Queried from the document, not $el: inside a click handler Alpine
      // scopes $el to the button that was pressed, not the component root
      const root = document.querySelector<HTMLElement>('.courses-app');
      if (!root) {
        mutate();
        return;
      }

      const levels = FILTER_LEVELS.map((sel) =>
        [...root.querySelectorAll<HTMLElement>(sel)],
      );
      const all = levels.flat();

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mutate();
        return;
      }

      // Settle anything still in flight so the measurements below are honest
      all.forEach((el) => cancelFilterAnim(el));
      const before = new Map(all.map((el) => [el, measure(el)] as const));

      mutate();

      this.$nextTick(() => {
        levels.forEach((list) => {
          list.forEach((el) => {
            const was = before.get(el);
            if (!was) return;
            const shown = isShown(el);
            if (was.shown === shown) return;
            // An ancestor is already collapsing or expanding this subtree
            if (el.parentElement?.closest('.is-filtering')) return;

            if (shown) animateFilterIn(el);
            else animateFilterOut(el, was);
          });
        });
      });
    },
  }));
};
