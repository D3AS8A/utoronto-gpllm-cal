import type { APIRoute, GetStaticPaths } from 'astro';
import { createEvent, type DateArray } from 'ics';
import { MONTHS, META, pickHours, toLocalIso, type CatKey } from '../../lib/calendar-data';

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

interface EventItem {
  isoStart: string;
  isoEnd: string;
  name: string;
}

function allEvents(): Array<{ slug: string; event: EventItem }> {
  const out: Array<{ slug: string; event: EventItem }> = [];
  const seen = new Set<string>();

  for (const month of MONTHS) {
    const monthNum = MONTH_NUM[month.name];
    for (const [dayStr, cats] of Object.entries(month.marks)) {
      const day = Number(dayStr);
      const iso = `${month.year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dow = (month.fdow + day - 1) % 7;
      const dedup = new Set<string>();
      for (const cat of cats as CatKey[]) {
        // intc + intb dedup to the same displayed session
        const key = cat === 'intb' ? 'intc' : cat;
        if (dedup.has(key)) continue;
        dedup.add(key);
        const meta = META[cat];
        const specific = pickHours(meta.hours, dow);
        if (!specific) continue;
        const slug = `${iso}-${safeFilename(meta.name)}`;
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push({
          slug,
          event: {
            isoStart: toLocalIso(iso, specific.start),
            isoEnd: toLocalIso(iso, specific.end),
            name: meta.name,
          },
        });
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
      title: e.name,
      description: 'UofT GPLLM program calendar',
      productId: 'utoronto-gpllm-cal/ics',
      calName: 'UofT GPLLM Calendar',
    }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

export const GET: APIRoute = async ({ props }) => {
  const value = await makeIcs(props as EventItem);
  return new Response(value, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
