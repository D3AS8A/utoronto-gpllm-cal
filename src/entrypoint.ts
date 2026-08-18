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
  /** Center-x of the source cell, viewport coords. */
  x: number;
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

function readFiltersFromUrl(): Record<string, boolean> | null {
  const p = new URLSearchParams(window.location.search);
  if (!p.has('f')) return null;
  const active = new Set(p.get('f')!.split(',').filter(Boolean));
  const next: Record<string, boolean> = {};
  for (const [urlKey, internal] of Object.entries(FILTER_URL_KEYS_REV)) {
    if (active.has(urlKey)) next[internal] = true;
  }
  return next;
}

function syncFiltersToUrl(filters: Record<string, boolean>) {
  const active: string[] = [];
  for (const key of Object.keys(FILTER_URL_KEYS)) {
    if (filters[key]) active.push(FILTER_URL_KEYS[key]);
  }
  const params = new URLSearchParams(window.location.search);
  const isDefault = active.length === 1 && active[0] === FILTER_URL_KEYS.reg;
  if (isDefault) {
    params.delete('f');
  } else {
    params.set('f', active.join(','));
  }
  const q = params.toString().replace(/%2C/g, ',');
  const url = q ? `${window.location.pathname}?${q}` : window.location.pathname;
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

export default (Alpine: Alpine) => {
  Alpine.data('calendar', () => ({
    filters: {} as Record<string, boolean>,
    classesOpen: true,
    examsOpen: false,
    fbHidden: false,
    detail: null as CalendarDetail | null,
    tooltip: {
      visible: false,
      travel: false,
      below: false,
      x: 0,
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
    _spSrcEl: null as HTMLElement | null,
    _spTrack: null as (() => void) | null,

    init() {
      // Fixed-position tooltip references cell viewport coords; drop it on
      // any scroll/resize so it doesn't hang in a stale spot.
      const drop = () => this.hideTooltip(0);
      window.addEventListener('scroll', drop, { passive: true, capture: true });
      window.addEventListener('resize', drop, { passive: true });

      const fromUrl = readFiltersFromUrl();
      if (fromUrl !== null) this.filters = fromUrl;

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
      const on = Object.keys(this.filters).filter((k) => this.filters[k]);
      return on.length === 1 && on[0] === 'reg';
    },

    /** Dim a cell whose `data-cats` doesn't intersect the active filter set. */
    isDim(catsAttr: string): boolean {
      const active = this.activeCats;
      if (active.size === 0) return false;
      const cats = (catsAttr || '').split(/\s+/).filter(Boolean);
      return cats.length > 0 && !cats.some((c) => active.has(c));
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
      const relevant = active.size === 0 ? all : all.filter((c) => active.has(c));
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

    openDetail(detail: CalendarDetail, sourceEl?: HTMLElement) {
      vibrate(9);
      this.detail = detail;
      this.tooltip.visible = false;
      this.tooltip.travel = false;
      this.tooltip.slot0 = null;
      this.tooltip.slot1 = null;
      this.tooltip.activeIso = '';
      if (this._ttHideTimer) { clearTimeout(this._ttHideTimer); this._ttHideTimer = 0; }
      if (this._ttClearTimer) { clearTimeout(this._ttClearTimer); this._ttClearTimer = 0; }
      if (this._ttEnterRaf) { cancelAnimationFrame(this._ttEnterRaf); this._ttEnterRaf = 0; }
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
    showTooltip(iso: string, detail: CalendarDetail, rect: DOMRect) {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      if (this._ttHideTimer) { clearTimeout(this._ttHideTimer); this._ttHideTimer = 0; }
      if (this._ttClearTimer) { clearTimeout(this._ttClearTimer); this._ttClearTimer = 0; }

      const belowNext = rect.top < 180;
      const x = rect.left + rect.width / 2;
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
        this.tooltip.yTop = rect.top;
        this.tooltip.yBottom = rect.bottom;
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
      this.tooltip.yTop = rect.top;
      this.tooltip.yBottom = rect.bottom;

      if (this._ttEnterRaf) cancelAnimationFrame(this._ttEnterRaf);
      this._ttEnterRaf = requestAnimationFrame(() => {
        this._ttEnterRaf = 0;
        this.tooltip.visible = true;
      });
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

    /** Google Calendar "add event" URL for one detail item. */
    googleCalUrl(item: DetailItem): string | null {
      if (!item.isoStart || !item.isoEnd) return null;
      const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: item.name,
        dates: `${toGcalStamp(item.isoStart)}/${toGcalStamp(item.isoEnd)}`,
        ctz: 'America/Toronto',
        details: 'UofT GPLLM program calendar',
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
      if (!item.isoStart) return '';
      const day = item.isoStart.slice(0, 10);
      const slug = `${day}-${safeFilename(item.name)}`;
      const host = window.location.host;
      return `webcal://${host}/ics/${slug}.ics`;
    },

    _withIcs(item: DetailItem, cb: (value: string, filename: string) => void) {
      if (!item.isoStart || !item.isoEnd) return;
      vibrate(6);
      createEvent({
        start: torontoToUtcArray(item.isoStart),
        end:   torontoToUtcArray(item.isoEnd),
        startInputType:  'utc',
        startOutputType: 'utc',
        endInputType:    'utc',
        endOutputType:   'utc',
        title: item.name,
        description: 'UofT GPLLM program calendar',
        productId: 'utoronto-gpllm-cal/ics',
        calName: 'UofT GPLLM Calendar',
      }, (error, value) => {
        if (error) { console.error('ics error', error); return; }
        const day = item.isoStart!.slice(0, 10);
        cb(value, `${day}-${safeFilename(item.name)}.ics`);
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
};
