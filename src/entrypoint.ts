/**
 * Alpine.js entrypoint, runs before Alpine.start()
 *
 * Registered here so alpine:init fires before Alpine walks the DOM —
 * required for @astrojs/alpinejs virtual-nav resilience (Safari especially).
 *
 * https://docs.astro.build/en/guides/integrations-guide/alpinejs/
 */

import type { Alpine } from 'alpinejs';

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
  finc:      ['finc'],
  dfin:      ['dfin'],
};

const CLASS_KEYS = ['reg', 'makeup', 'lmc', 'lmb', 'alrw', 'orient', 'intensive'];
const EXAM_KEYS  = ['mid', 'dmid', 'fin', 'finc', 'dfin'];

function vibrate(ms: number) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* noop */ }
}

interface CalendarDetail {
  weekday: string;
  dateLabel: string;
  headBg: string;
  items: Array<{ name: string; time: string; swatchStyle: string }>;
}

export default (Alpine: Alpine) => {
  Alpine.data('calendar', () => ({
    season: 'all' as 'all' | 'fall' | 'winter' | 'summer',
    filters: {} as Record<string, boolean>,
    rails: true,
    keyOpen: false,
    detail: null as CalendarDetail | null,

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

    /** Dim a cell whose `data-cats` doesn't intersect the active filter set. */
    isDim(catsAttr: string): boolean {
      const active = this.activeCats;
      if (active.size === 0) return false;
      const cats = (catsAttr || '').split(/\s+/).filter(Boolean);
      return cats.length > 0 && !cats.some((c) => active.has(c));
    },

    toggle(key: string) {
      vibrate(6);
      this.filters = { ...this.filters, [key]: !this.filters[key] };
    },

    setGroup(group: 'classes' | 'exams', value: boolean) {
      vibrate(6);
      const keys = group === 'classes' ? CLASS_KEYS : EXAM_KEYS;
      const next = { ...this.filters };
      for (const k of keys) next[k] = value;
      this.filters = next;
    },

    reset() {
      vibrate(6);
      this.filters = {};
    },

    openDetail(detail: CalendarDetail) {
      vibrate(9);
      this.detail = detail;
    },
  }));
};
