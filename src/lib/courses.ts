/**
 * Course data, shaped once and shared.
 *
 * The courses page wants a catalogue and a weekly schedule; the calendar wants
 * to know which classes meet on a given date. Both come from the same rows in
 * courses.toon, so the shaping lives here rather than in either page.
 *
 * Server-only: readToon reaches for the filesystem. The calendar hands what the
 * browser needs to the page as JSON instead of importing this.
 */

import { loadPage } from './content';
import type { CatKey, HourMin } from './calendar-data';
import { toLocalIso } from './calendar-data';
import { courseEventTitle, safeFilename, SITE_URL, type EventCourse } from './event';

export interface CatalogRow {
  code: string; title: string; conc: string; capped: boolean; nca: string; req: boolean;
}
export interface DetailRow { code: string; credits: number; slug: string; desc: string }
export interface OfferingRow { ref: string; room: string; prof: string }
export interface ProfileRow { name: string; path: string }
export interface ProgramRow {
  key: string; code: string; kind: string; title: string; when: string;
  conc: string; capped: boolean; nca: string; desc: string;
  /** URL token for the two program courses that have no code to build one from. */
  slug?: string;
}
export interface Slot { name: string; time: string; courses: string; note: string }
export interface Term {
  no: string; label: string; range: string;
  /** ISO bounds for the weekly term. `range` is the human copy of these. */
  start: string; end: string;
  slots: Slot[];
}

export interface CoursesContent {
  eyebrow: string; eyebrow_datetime: string; heading: string; intro: string;
  requirements: string; course_url_base: string; desc_placeholder: string;
  concentrations: Array<{ key: string; label: string; short: string }>;
  program_courses: ProgramRow[];
  details: DetailRow[];
  offerings: OfferingRow[];
  profiles: ProfileRow[];
  profile_url_base: string;
  catalog: CatalogRow[];
  terms: Record<string, Term>;
}

export interface CourseDef {
  code?: string; kind?: string; title: string; when?: string;
  conc: string[]; credits?: number; slug?: string;
  capped: boolean; nca?: string; req: boolean; desc?: string;
}

export interface Person { name: string; url?: string }
export interface RunDef {
  term: string; slot: string; time: string; room: string; people: Person[];
}

export interface ShapedCourses {
  content: CoursesContent;
  concLabels: Record<string, { label: string; short: string }>;
  catalog: Record<string, CourseDef>;
  offerings: Record<string, OfferingRow & { people: Person[] }>;
  byCourse: Map<string, { course: CourseDef; runs: RunDef[] }>;
}

let cache: ShapedCourses | null = null;

export function shapeCourses(): ShapedCourses {
  if (cache) return cache;

  const { content } = loadPage<CoursesContent>('courses');

  const concLabels = Object.fromEntries(
    content.concentrations.map((c) => [c.key, { label: c.label, short: c.short }]),
  );

  const details = Object.fromEntries(content.details.map((row) => [row.code, row]));
  const profiles = Object.fromEntries(content.profiles.map((row) => [row.name, row.path]));

  // Instructors are stored as one string; split them out and attach a profile
  // link where the faculty directory lists one
  const offerings = Object.fromEntries(
    content.offerings.map((row) => [
      row.ref,
      {
        ...row,
        people: row.prof
          ? row.prof.split(', ').map((name) => ({
              name,
              url: profiles[name] ? `${content.profile_url_base}${profiles[name]}` : undefined,
            }))
          : [],
      },
    ]),
  );

  const catalog: Record<string, CourseDef> = Object.fromEntries([
    ...content.catalog.map((row) => [
      row.code,
      { ...row, ...details[row.code], conc: row.conc.split('/') },
    ]),
    ...content.program_courses.map((row) => [
      row.key,
      {
        ...row,
        credits: row.code ? details[row.code]?.credits : undefined,
        slug: row.slug || (row.code ? details[row.code]?.slug : undefined),
        code: row.code || undefined,
        req: false,
        conc: row.conc.split('/'),
      },
    ]),
  ]);

  /*
    The schedule is stored term by term, which lists a course once per run. A
    catalogue wants the opposite: one entry per course, carrying its runs. So
    walk the terms in calendar order and collect each course's runs as we meet
    them. Courses taught twice (Constitutional Law, Criminal Law, Professional
    Responsibility, Aboriginal Law) collapse into a single entry here.
  */
  const byCourse = new Map<string, { course: CourseDef; runs: RunDef[] }>();
  for (const term of Object.values(content.terms)) {
    for (const slot of term.slots) {
      for (const ref of slot.courses.split('|')) {
        const key = ref.split(' ')[0];
        const course = catalog[key];
        if (!course) continue;
        const entry = byCourse.get(key) ?? { course, runs: [] };
        entry.runs.push({
          term: term.label,
          slot: slot.name,
          time: slot.time,
          room: offerings[ref]?.room ?? '',
          people: offerings[ref]?.people ?? [],
        });
        byCourse.set(key, entry);
      }
    }
  }

  cache = { content, concLabels, catalog, offerings, byCourse };
  return cache;
}

/**
 * The token a course is addressed by in a URL, e.g. `law4024` or
 * `legal-methods-cdn`.
 *
 * Registrar codes all carry the H that marks a half credit, so dropping it
 * reads better and cannot collide — every code here shares the suffix. The two
 * Legal Methods courses have no code at all and carry their own slug instead.
 */
export function courseToken(course: CourseDef, key: string): string {
  if (course.code) return course.code.replace(/H$/i, '').toLowerCase();
  return course.slug ?? key;
}

/* ---- Calendar bridge ----------------------------------------------------- */

const FRI = 'Friday Evenings';
const SAT_AM = 'Saturday Mornings';
const SAT_PM = 'Saturday Afternoons';

/** Slot names whose `time` is a clock range. The rest hold a date range. */
const TIMED_SLOTS = new Set([FRI, SAT_AM, SAT_PM]);

/** Legal Methods and ALRW days each name exactly one program course. */
const PROGRAM_CAT: Partial<Record<CatKey, string>> = {
  lmc:  'lm-cdn',
  lmb:  'lm-bus',
  alrw: 'alrw',
};

/**
 * "8:30am-1:00pm" → [[8,30],[13,0]].
 *
 * Throws rather than falling back: this runs at build time, and a slot whose
 * time stopped parsing would otherwise silently hand every class on that day
 * the whole-day span instead of its own hours.
 */
export function parseSlotTime(time: string): [HourMin, HourMin] {
  const parts = time.split('-');
  if (parts.length !== 2) throw new Error(`Unparseable slot time: "${time}"`);
  return parts.map((part) => {
    const m = part.trim().match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/i);
    if (!m) throw new Error(`Unparseable slot time: "${time}"`);
    const suffix = m[3].toLowerCase();
    let hour = Number(m[1]) % 12;
    if (suffix === 'pm') hour += 12;
    return [hour, Number(m[2] ?? 0)] as HourMin;
  }) as [HourMin, HourMin];
}

/** One selectable class on a calendar day. */
export interface CourseOption {
  /** Offering ref or program key — the dictionary key the client looks up. */
  ref: string;
  title: string;
  slot: string;
  /** Present only when the slot narrows the day's hours. */
  isoStart?: string;
  isoEnd?: string;
  /** Static .ics basename. Built here so the client never has to re-derive it. */
  slug: string;
}

function termFor(dateIso: string, terms: Record<string, Term>): Term | null {
  return Object.values(terms).find((t) => dateIso >= t.start && dateIso <= t.end) ?? null;
}

function termBySeason(season: string, terms: Record<string, Term>): Term | null {
  return terms[season] ?? null;
}

function optionsFromSlot(
  slot: Slot,
  dateIso: string,
  shaped: ShapedCourses,
): Array<Omit<CourseOption, 'slug'>> {
  const hours = TIMED_SLOTS.has(slot.name) ? parseSlotTime(slot.time) : null;
  return slot.courses.split('|').flatMap((ref) => {
    const course = shaped.catalog[ref.split(' ')[0]];
    if (!course) return [];
    return [{
      ref,
      title: course.title,
      slot: slot.name,
      ...(hours
        ? { isoStart: toLocalIso(dateIso, hours[0]), isoEnd: toLocalIso(dateIso, hours[1]) }
        : {}),
    }];
  });
}

/**
 * Constitutional Law meets Saturday morning and Saturday afternoon, so on a
 * Saturday two options share a title and would land on one .ics filename —
 * both choices would then download the morning's file. Only the colliding ones
 * take the section suffix, so every other slug stays readable.
 */
function withSlugs(
  options: Array<Omit<CourseOption, 'slug'>>,
  dateIso: string,
  cat: CatKey,
): CourseOption[] {
  const base = options.map((o) => `${dateIso}-${safeFilename(courseEventTitle(o, cat))}`);
  const seen = new Map<string, number>();
  for (const b of base) seen.set(b, (seen.get(b) ?? 0) + 1);
  return options.map((o, i) => ({
    ...o,
    slug: (seen.get(base[i]) ?? 0) > 1
      ? `${base[i]}-${safeFilename(o.ref.split(' ').pop() ?? String(i))}`
      : base[i],
  }));
}

/**
 * Classes that meet on a given calendar day.
 *
 * Regular days resolve by date, not by the month's season: April 30 is marked
 * in a winter month but belongs to the summer term, which starts that day.
 * Intensives sit outside their term's weekly range, so those resolve by season
 * instead.
 */
export function candidatesFor(
  dateIso: string,
  cat: CatKey,
  dow: number,
  season: string,
): CourseOption[] {
  const shaped = shapeCourses();
  const { terms } = shaped.content;

  const programKey = PROGRAM_CAT[cat];
  if (programKey) {
    const course = shaped.catalog[programKey];
    if (!course) return [];
    return withSlugs(
      [{ ref: programKey, title: course.title, slot: 'Program Foundations' }],
      dateIso, cat,
    );
  }

  if (cat === 'reg') {
    const term = termFor(dateIso, terms);
    if (!term) return [];
    const wanted = dow === 5 ? [FRI] : dow === 6 ? [SAT_AM, SAT_PM] : [];
    return withSlugs(
      term.slots
        .filter((s) => wanted.includes(s.name))
        .flatMap((s) => optionsFromSlot(s, dateIso, shaped)),
      dateIso, cat,
    );
  }

  if (cat === 'intc' || cat === 'intb') {
    const term = termBySeason(season, terms);
    if (!term) return [];
    return withSlugs(
      term.slots
        .filter((s) => s.name.includes('Intensive'))
        .flatMap((s) => optionsFromSlot(s, dateIso, shaped)),
      dateIso, cat,
    );
  }

  return [];
}

/** Everything the browser needs to describe a picked class, keyed by ref. */
export function courseEventIndex(): Record<string, EventCourse> {
  const shaped = shapeCourses();
  const { content, catalog, offerings, concLabels } = shaped;
  const index: Record<string, EventCourse> = {};

  const add = (ref: string, slot: string, time: string) => {
    const key = ref.split(' ')[0];
    const course = catalog[key];
    if (!course || index[ref]) return;
    const offering = offerings[ref];
    index[ref] = {
      title: course.title,
      // Absolute: the event leaves the browser entirely
      siteUrl: `${SITE_URL}/courses/#${courseToken(course, key)}`,
      code: course.code,
      kind: course.kind,
      credits: course.credits,
      conc: course.conc.map((k) => concLabels[k]?.label ?? k),
      capped: course.capped,
      nca: course.nca,
      desc: course.desc || content.desc_placeholder.replace('{title}', course.title),
      url: course.slug ? `${content.course_url_base}${course.slug}` : undefined,
      room: offering?.room || undefined,
      people: offering?.people?.length ? offering.people : undefined,
      slot,
      time: TIMED_SLOTS.has(slot) ? time : undefined,
    };
  };

  for (const term of Object.values(content.terms)) {
    for (const slot of term.slots) {
      for (const ref of slot.courses.split('|')) add(ref, slot.name, slot.time);
    }
  }
  return index;
}
