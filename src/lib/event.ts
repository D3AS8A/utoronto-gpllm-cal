/**
 * Event title and description building, shared by every path that emits a
 * calendar event: the Google Cal URL and the .ics download in entrypoint.ts,
 * and the pre-built static files in pages/ics/[slug].ics.ts.
 *
 * Kept free of node imports so the client bundle can use it, the same way
 * calendar-data.ts is.
 */

import type { CatKey } from './calendar-data';

/** Everything a picked course contributes to its event. */
export interface EventCourse {
  title: string;
  code?: string;
  kind?: string;
  credits?: number;
  /** Concentration labels, already resolved from their keys. */
  conc?: string[];
  capped?: boolean;
  /** '' | 'yes' | 'required' */
  nca?: string;
  desc?: string;
  /** Faculty site page for the course. */
  url?: string;
  room?: string;
  people?: Array<{ name: string; url?: string }>;
  /** Slot this run belongs to, e.g. "Saturday Mornings". */
  slot?: string;
  /** Slot's own time string, e.g. "8:30am-1:00pm". */
  time?: string;
}

/**
 * Bracketed qualifier after the course title, so an event reads as the class
 * it is rather than as a bare course name sitting in someone's week.
 */
const CAT_QUALIFIER: Partial<Record<CatKey, string>> = {
  reg:  'regular class',
  intc: 'intensive',
  intb: 'intensive',
  // Legal Methods and ALRW are deliberately absent: their titles already name
  // what they are, and a qualifier gives "Legal Methods (Canadian Law)
  // (intensive)" — two parentheticals in a row
};

export function courseEventTitle(course: EventCourse, cat: CatKey): string {
  const qualifier = CAT_QUALIFIER[cat];
  return qualifier ? `${course.title} (${qualifier})` : course.title;
}

/** Filename-safe slug fragment. Shared so the static .ics paths and the
 *  webcal:// URLs the client builds can never drift apart. */
export function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

const SIGN_OFF = 'UofT GPLLM program calendar';
export const ATTRIBUTION = `${SIGN_OFF}\ngpllm.pages.dev`;

const NCA_LABEL: Record<string, string> = {
  yes:      'Counts toward the NCA',
  required: 'NCA required subject',
};

/** The course's own block, in the order someone would want to read it. */
function courseLines(c: EventCourse): string[] {
  const lines: string[] = [];

  const heading = [c.code ?? c.kind, c.credits ? `${c.credits} credits` : null]
    .filter(Boolean)
    .join(' · ');
  if (heading) lines.push(heading);

  if (c.slot) lines.push(c.time ? `${c.slot}, ${c.time}` : c.slot);
  if (c.room) lines.push(`Room ${c.room}`);

  if (c.people?.length) {
    const label = c.people.length > 1 ? 'Instructors' : 'Instructor';
    lines.push(`${label}: ${c.people.map((p) => p.name).join(', ')}`);
  }

  const tags = [
    ...(c.conc ?? []),
    c.nca ? NCA_LABEL[c.nca] ?? null : null,
    c.capped ? 'Enrolment capped' : null,
  ].filter(Boolean);
  if (tags.length) lines.push(tags.join(' · '));

  if (c.desc) lines.push('', c.desc);
  if (c.url) lines.push('', c.url);

  return lines;
}

/**
 * Day note first, then the course, then the attribution — which every event
 * carries whether or not a course was picked.
 */
export function buildDescription(note?: string | null, course?: EventCourse | null): string {
  const blocks: string[] = [];
  if (note) blocks.push(note);
  if (course) blocks.push(courseLines(course).join('\n'));
  blocks.push(ATTRIBUTION);
  return blocks.join('\n\n');
}
