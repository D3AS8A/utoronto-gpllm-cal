// Session category metadata: display name, time string, swatch type + color

export type CatKey =
  | 'reg' | 'makeup' | 'lmc' | 'lmb' | 'alrw' | 'orient'
  | 'intc' | 'intb'
  | 'mid' | 'dmid' | 'fin' | 'finc' | 'dfin';

export type SwatchType = 'fill' | 'outline' | 'dashed' | 'circle' | 'alrw' | 'orient';

/** [hour 0-23, minute 0-59] — naive, timezone applied downstream. */
export type HourMin = [number, number];
export interface Hours { start: HourMin; end: HourMin }

/**
 * Per-day-of-week hours mapping. `pickHours()` matches most-specific first:
 * fri/sat/sun beat weekday/weekend which beat `any`. Missing keys mean no
 * scheduled time for that day (e.g. make-up classes are always TBD).
 */
export interface HoursByDow {
  fri?: Hours;
  sat?: Hours;
  sun?: Hours;
  weekday?: Hours;
  weekend?: Hours;
  any?: Hours;
}

export interface CatMeta {
  name: string;
  time: string;   // human-readable description — the string shown pre-hours
  t: SwatchType;
  c: string;
  hours: HoursByDow;
}

// Reused blocks
const EXAM_HOURS: HoursByDow = {
  weekday: { start: [18, 0], end: [21, 0] },
  weekend: { start: [13, 0], end: [16, 0] },
};

const INTENSIVE_HOURS: HoursByDow = {
  fri: { start: [16, 0], end: [21, 0] },
  sat: { start: [8, 30], end: [17, 30] },
  sun: { start: [9, 0], end: [13, 30] },
};

export const META: Record<CatKey, CatMeta> = {
  reg: {
    name: 'Regular Classes', time: 'Fri 4–9pm · Sat 8:30am–6:30pm',
    t: 'fill', c: '#1f6092',
    hours: {
      fri: { start: [16, 0], end: [21, 0] },
      sat: { start: [8, 30], end: [18, 30] },
    },
  },
  makeup: {
    name: 'Make-Up Class', time: 'Rescheduled session',
    t: 'fill', c: '#bdc9d7',
    hours: {},
  },
  lmc: {
    name: 'Legal Methods — Canadian Law', time: '9:30am–4:30pm',
    t: 'fill', c: '#af9b88',
    hours: { any: { start: [9, 30], end: [16, 30] } },
  },
  lmb: {
    name: 'Legal Methods — Business Law & Innovation, Law & Technology', time: '9:30am–4:30pm',
    t: 'fill', c: '#936e42',
    hours: { any: { start: [9, 30], end: [16, 30] } },
  },
  alrw: {
    name: 'Applied Legal Research & Writing Intensive — Canadian Law', time: '9:30am–5:30pm',
    t: 'alrw', c: '#002554',
    hours: { any: { start: [9, 30], end: [17, 30] } },
  },
  orient: {
    name: 'Orientation Evening', time: '6:00–8:00pm',
    t: 'orient', c: '#af9b88',
    hours: { any: { start: [18, 0], end: [20, 0] } },
  },
  intc: {
    name: 'Intensive Course', time: 'Fri 4–9pm · Sat 8:30–5:30 · Sun 9–1:30',
    t: 'fill', c: '#e5d3a1',
    hours: INTENSIVE_HOURS,
  },
  intb: {
    name: 'Intensive Course', time: 'Fri 4–9pm · Sat 8:30–5:30 · Sun 9–1:30',
    t: 'fill', c: '#936e42',
    hours: INTENSIVE_HOURS,
  },
  mid:  { name: 'Mid-Term Exam',           time: 'Weekdays 6–9pm · Weekends 1–4pm', t: 'outline', c: '#1f6092', hours: EXAM_HOURS },
  dmid: { name: 'Deferred Mid-Term Exam',  time: 'Weekdays 6–9pm · Weekends 1–4pm', t: 'circle',  c: '#70c7e9', hours: EXAM_HOURS },
  fin:  { name: 'Final Exam',              time: 'Weekdays 6–9pm · Weekends 1–4pm', t: 'outline', c: '#002554', hours: EXAM_HOURS },
  finc: { name: 'Final Exam — Canadian Law',    time: 'Weekdays 6–9pm · Weekends 1–4pm', t: 'dashed',  c: '#002554', hours: EXAM_HOURS },
  dfin: { name: 'Deferred Final Exam',     time: 'Weekdays 6–9pm · Weekends 1–4pm', t: 'outline', c: '#70c7e9', hours: EXAM_HOURS },
};

/** dow: 0=Sun … 6=Sat. Returns null when no rule matches (session has no set time). */
export function pickHours(h: HoursByDow, dow: number): Hours | null {
  if (dow === 5 && h.fri) return h.fri;
  if (dow === 6 && h.sat) return h.sat;
  if (dow === 0 && h.sun) return h.sun;
  if ((dow === 0 || dow === 6) && h.weekend) return h.weekend;
  if (dow >= 1 && dow <= 5 && h.weekday) return h.weekday;
  return h.any ?? null;
}

/** 24h → 12h with am/pm; drops :00 minutes for compactness. */
export function fmtTime([h, m]: HourMin): string {
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${suffix}` : `${hh}:${String(m).padStart(2, '0')}${suffix}`;
}

export function fmtHours(h: Hours): string {
  return `${fmtTime(h.start)}–${fmtTime(h.end)}`;
}

/** Naive local-time ISO stamp (no timezone offset). Consumer applies TZ. */
export function toLocalIso(dateIso: string, [h, m]: HourMin): string {
  return `${dateIso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export interface FilterDef {
  key: string;
  cats: CatKey[];
  /** Override META fields when the filter aggregates multiple cats (e.g. intensive). */
  name?: string;
  time?: string;
  t?: SwatchType;
  c?: string;
}

export const FILTERS_CLASSES: FilterDef[] = [
  { key: 'reg',       cats: ['reg'] },
  { key: 'makeup',    cats: ['makeup'] },
  { key: 'lmc',       cats: ['lmc'] },
  { key: 'lmb',       cats: ['lmb'] },
  { key: 'alrw',      cats: ['alrw'] },
  { key: 'orient',    cats: ['orient'] },
  { key: 'intensive', cats: ['intc', 'intb'], name: 'Intensive Courses',
    time: 'Fri 4–9pm · Sat 8:30–5:30 · Sun 9–1:30', t: 'fill', c: '#e5d3a1' },
];

export const FILTERS_EXAMS: FilterDef[] = [
  { key: 'mid',  cats: ['mid'] },
  { key: 'dmid', cats: ['dmid'] },
  { key: 'fin',  cats: ['fin'] },
  { key: 'finc', cats: ['finc'] },
  { key: 'dfin', cats: ['dfin'] },
];

export type SeasonKey = 'fall' | 'winter' | 'summer';

export interface MonthDef {
  name: string;
  year: string;
  season: SeasonKey;
  fdow: number; // day-of-week (0=Sun) that the 1st falls on
  days: number;
  marks: Record<number, CatKey[]>;
  callouts?: Array<{ label: string; detail: string; tone: 'cream' | 'ink' | 'tan' }>;
}

export const MONTHS: MonthDef[] = [
  { name: 'September', year: '2026', season: 'fall', fdow: 2, days: 30, marks: {
      8: ['orient'], 9: ['orient'], 10: ['lmc'], 11: ['lmc'], 12: ['lmb', 'alrw'], 13: ['lmb', 'alrw'],
      17: ['lmc'], 18: ['lmc'], 19: ['lmb', 'alrw'], 20: ['lmb', 'alrw'], 25: ['reg'], 26: ['reg'] },
    callouts: [{ label: 'Orientation Evenings',
      detail: 'Cdn Law — Sept 8, 6:00–8:00pm · Bus Law & ILT — Sept 9, 6:00–8:00pm', tone: 'tan' }] },
  { name: 'October', year: '2026', season: 'fall', fdow: 4, days: 31, marks: {
      2: ['reg'], 3: ['reg'], 4: ['makeup'], 16: ['reg'], 17: ['reg'],
      23: ['reg'], 24: ['reg'], 25: ['makeup'], 31: ['mid'] } },
  { name: 'November', year: '2026', season: 'fall', fdow: 0, days: 30, marks: {
      1: ['mid'], 5: ['mid'], 6: ['reg', 'dmid'], 7: ['reg'], 8: ['makeup'],
      13: ['dmid'], 20: ['reg'], 21: ['reg'], 28: ['mid'], 29: ['mid'] } },
  { name: 'December', year: '2026', season: 'fall', fdow: 2, days: 31, marks: {
      3: ['fin'], 4: ['intc'], 5: ['intc', 'finc'], 6: ['intc', 'finc'], 10: ['dfin'],
      11: ['intb'], 12: ['intb'], 13: ['intb'], 17: ['dfin'], 18: ['intb'], 19: ['intb'] },
    callouts: [{ label: 'December Intensive 1 & 2',
      detail: 'Intensives 1 & 2 overlap. Some dates to be released — please hold for now.', tone: 'cream' }] },
  { name: 'January', year: '2027', season: 'winter', fdow: 5, days: 31, marks: {
      8: ['reg'], 9: ['reg'], 10: ['fin'], 22: ['reg'], 23: ['reg'], 24: ['makeup'] },
    callouts: [{ label: 'Intensive Final Exam', detail: 'January 10.', tone: 'ink' }] },
  { name: 'February', year: '2027', season: 'winter', fdow: 1, days: 28, marks: {
      5: ['reg'], 6: ['reg'], 19: ['mid'], 20: ['mid'], 21: ['mid'],
      26: ['dmid'], 27: ['reg'], 28: ['makeup'] } },
  { name: 'March', year: '2027', season: 'winter', fdow: 1, days: 31, marks: {
      5: ['reg', 'dmid'], 6: ['reg'], 7: ['dmid'], 19: ['reg'], 20: ['reg'], 21: ['makeup'] } },
  { name: 'April', year: '2027', season: 'winter', fdow: 4, days: 30, marks: {
      3: ['fin'], 4: ['fin'], 8: ['fin'], 9: ['intc'], 10: ['intc'], 11: ['intc'],
      16: ['intc'], 17: ['intc'], 18: ['intc'], 30: ['reg'] },
    callouts: [{ label: 'April Intensive',
      detail: 'Some dates to be released — please hold for now.', tone: 'cream' }] },
  { name: 'May', year: '2027', season: 'summer', fdow: 6, days: 31, marks: {
      1: ['reg'], 7: ['reg'], 8: ['reg'], 9: ['makeup'], 14: ['reg'], 15: ['reg'],
      16: ['fin'], 29: ['finc'], 30: ['finc'] },
    callouts: [{ label: 'Intensive Final Exam', detail: 'May 16.', tone: 'ink' }] },
  { name: 'June', year: '2027', season: 'summer', fdow: 2, days: 30, marks: {
      4: ['reg'], 5: ['reg'], 6: ['fin'], 11: ['reg', 'dfin'], 12: ['reg'],
      13: ['dmid'], 18: ['reg'], 19: ['reg'], 25: ['fin'], 26: ['fin'], 27: ['fin'] } },
  { name: 'July', year: '2027', season: 'summer', fdow: 4, days: 31, marks: {
      9: ['dfin'], 10: ['dfin'], 11: ['dfin'], 12: ['dfin'] } },
];

export const SEASON_ORDER: SeasonKey[] = ['fall', 'winter', 'summer'];

export const SEASON_META: Record<SeasonKey, { no: string; name: string; sub: string }> = {
  fall:   { no: '01', name: 'Fall',   sub: 'September – December 2026' },
  winter: { no: '02', name: 'Winter', sub: 'January – April 2027' },
  summer: { no: '03', name: 'Summer', sub: 'May – July 2027' },
};

export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ---------------------------------------------------------------------------
// Visual helpers used at build time to compute per-cell styles

export function swatchStyle(t: SwatchType, c: string, size = 22): string {
  const base = `width:${size / 16}rem;height:${size / 16}rem;flex:none;box-sizing:border-box;`;
  if (t === 'outline') return base + `background:#fff;border:0.1875rem solid ${c};`;
  if (t === 'dashed')  return base + `background:#fff;border:0.1875rem dashed ${c};`;
  if (t === 'circle')  return base + `background:${c};border-radius:50%;`;
  if (t === 'alrw')    return base + `background:#fff;border:0.125rem dotted #002554;border-radius:50%;`;
  if (t === 'orient')  return base + `background:#f7f0e2;border:0.125rem solid #af9b88;`;
  return base + `background:${c};`;
}

export interface CellVisual {
  bg: string;
  fg: string;
  border: string;
  /** Layered outline (overlaid on top of the border for the ALRW dotted pattern) */
  outline?: string;
  /** Bottom-right triangular overlay color for class + deferred-exam days */
  cornerColor?: string;
  isBold: boolean;
}

const CLASS_COLORS: Record<string, [string, string]> = {
  reg:    ['#1f6092', '#fff'],
  makeup: ['#bdc9d7', '#002554'],
  lmc:    ['#af9b88', '#2a1d0a'],
  lmb:    ['#936e42', '#fff'],
  intc:   ['#e5d3a1', '#4a3410'],
  intb:   ['#936e42', '#fff'],
};

const DEFERRED_COLOR = '#70c7e9';

export function cellVisual(cats: CatKey[]): CellVisual {
  const has = (k: CatKey) => cats.indexOf(k) !== -1;
  const classKey = (['reg', 'makeup', 'lmc', 'lmb', 'intc', 'intb', 'orient'] as CatKey[]).find(has);
  const hasDeferred = has('dmid') || has('dfin');
  let bg = 'transparent', fg = '#002554', border = '0.125rem solid transparent';
  let outline: string | undefined;
  if (classKey === 'orient') { bg = '#f7f0e2'; fg = '#6b4e22'; border = '0.125rem solid #af9b88'; }
  else if (classKey)          { [bg, fg] = CLASS_COLORS[classKey]; }
  else if (has('dmid'))       { bg = DEFERRED_COLOR; fg = '#002554'; }
  if      (has('mid'))                     border = '0.125rem solid #1f6092';
  else if (has('fin'))                     border = '0.125rem solid #002554';
  else if (has('finc'))                    border = '0.125rem dashed #002554';
  else if (has('dfin') && !classKey)       border = '0.125rem solid #70c7e9';
  // ALRW → white solid inner border + blue dotted outline on top of it.
  if (has('alrw')) {
    border = '0.125rem solid #fff';
    outline = '0.125rem dotted #002554';
  }
  // Class + deferred exam → BR corner triangle in deferred color; kill the
  // border so the triangle sits flush with the cell edge (a transparent
  // border leaves 0.125rem of class-color showing around the triangle).
  const cornerColor = classKey && hasDeferred ? DEFERRED_COLOR : undefined;
  if (cornerColor) border = '0';
  return { bg, fg, border, outline, cornerColor, isBold: !!(classKey || has('dmid')) };
}

export function countFor(cats: CatKey[]): number {
  let n = 0;
  for (const m of MONTHS) {
    for (const d of Object.keys(m.marks)) {
      if (m.marks[Number(d)].some(c => cats.includes(c))) n++;
    }
  }
  return n;
}

export function calloutStyle(tone: 'cream' | 'ink' | 'tan'): string {
  const bg  = tone === 'cream' ? '#f6eccf' : tone === 'ink' ? '#eef1f5' : '#f3ece0';
  const bar = tone === 'cream' ? '#c9a94e' : tone === 'ink' ? '#002554' : '#af9b88';
  return `background:${bg};border-left:0.1875rem solid ${bar}`;
}

/** Weekday name for a given month-day; uses fdow (day-of-week for the 1st). */
export function weekdayName(fdow: number, day: number): string {
  return DOW[(fdow + day - 1) % 7];
}

/** All (dedup) filter defs across both groups, used for the drawer + activeCats lookup. */
export const ALL_FILTERS: FilterDef[] = [...FILTERS_CLASSES, ...FILTERS_EXAMS];
