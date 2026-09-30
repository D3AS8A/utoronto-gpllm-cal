import type { APIRoute, GetStaticPaths } from 'astro';
import { createEvent, type DateArray } from 'ics';
import { MONTHS, META, pickHours, toLocalIso, itemNote, type CatKey } from '../../lib/calendar-data';
import {
  buildDescription, courseEventTitle, eventSummary,
  EVENT_ALARMS, EVENT_LOCATION, withTimezone,
} from '../../lib/event';
import { sessionsFor, courseEventIndex } from '../../lib/courses';
import type { EventCourse } from '../../lib/event';

const MONTH_NUM: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function torontoOffsetHours(dateStr: string): number {
  return (dateStr >= '2026-11-01' && dateStr <= '2027-03-13') ? -5 : -4;
}

function torontoToUtcArray(isoLocal: string): DateArray {
  const dateStr = isoLocal.slice(0, 10);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = isoLocal.slice(11, 16).split(':').map(Number);
  const offset = torontoOffsetHours(dateStr);
  const utc = new Date(Date.UTC(y, mo - 1, d, h - offset, mi));
  return [
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
    utc.getUTCHours(),
    utc.getUTCMinutes(),
  ];
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
}

// Index signature satisfies Astro's GetStaticPaths props constraint
interface EventItem extends Record<string, unknown> {
  isoStart: string;
  isoEnd: string;
  name: string;
  /** Pre-built description — already carries the note and the attribution. */
  description: string;
}

/**
 * The index knows one slot per ref. A ref offered on some other day (Foundations
 * of Canadian Law on Sept 18) takes that day's slot and drops the stale time.
 */
function slotFor(course: EventCourse, slot: string): EventCourse {
  return slot === course.slot ? course : { ...course, slot, time: undefined };
}

function allEvents(): Array<{ slug: string; event: EventItem }> {
  const out: Array<{ slug: string; event: EventItem }> = [];
  const seen = new Set<string>();
  const index = courseEventIndex();

  for (const month of MONTHS) {
    const monthNum = MONTH_NUM[month.name];
    for (const [dayStr, cats] of Object.entries(month.marks)) {
      const day = Number(dayStr);
      const iso = `${month.year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = (month.fdow + day - 1) % 7;
      const noteEntry = month.notes?.[day];
      let firstItem = true;
      for (const cat of cats as CatKey[]) {
        const meta = META[cat];
        const dayHours = pickHours(meta.hours, dow);
        for (const session of sessionsFor(iso, cat, dow, month.season, noteEntry?.courses ?? [])) {
          const hours = session.hours
            ? { start: session.hours[0], end: session.hours[1] }
            : dayHours;
          if (!hours) continue;
          // note.title overrides the primary (first) event's title
          const baseName = firstItem && noteEntry?.title ? noteEntry.title : meta.name;
          firstItem = false;
          const name = session.label ? `${baseName} · ${session.label}` : baseName;
          const slug = `${iso}-${safeFilename(name)}`;
          if (seen.has(slug)) continue;
          seen.add(slug);
          const isoStart = toLocalIso(iso, hours.start);
          const isoEnd = toLocalIso(iso, hours.end);
          // Merge day-level note (all items) with per-item note (this cat+dow).
          const combinedNote = [noteEntry?.text, itemNote(cat, dow)]
            .filter(Boolean)
            .join('\n');
          out.push({
            slug,
            event: {
              isoStart,
              isoEnd,
              name,
              description: buildDescription(combinedNote || null, null),
            },
          });

          /*
           * A variant per class that meets this sitting, so the webcal:// CTA
           * still resolves once someone picks one. Titles come from the same
           * helper the client uses, which is what keeps the two slug schemes in
           * step rather than merely alike.
           */
          for (const opt of session.options) {
            const course = index[opt.ref];
            if (!course) continue;
            if (seen.has(opt.slug)) continue;
            seen.add(opt.slug);
            out.push({
              slug: opt.slug,
              event: {
                isoStart,
                isoEnd,
                name: courseEventTitle(course, cat),
                description: buildDescription(combinedNote || null, slotFor(course, opt.slot)),
              },
            });
          }
        }
      }
    }
  }
  return out;
}

export const getStaticPaths: GetStaticPaths = () =>
  allEvents().map(({ slug, event }) => ({ params: { slug }, props: event }));

function makeIcs(e: EventItem): Promise<string> {
  return new Promise((resolve, reject) => {
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
      if (error) reject(error);
      else resolve(withTimezone(value));
    });
  });
}

export const GET: APIRoute = async ({ props }) => {
  const value = await makeIcs(props as EventItem);
  return new Response(value, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
