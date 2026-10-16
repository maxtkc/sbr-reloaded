import { getCollection, type CollectionEntry } from 'astro:content';
import rrulePkg from 'rrule';
import { londonNow } from './london-now';

const { RRule } = rrulePkg;

export type EventEntry = CollectionEntry<'events'>;

export interface Occurrence {
  event: EventEntry;
  // Local Europe/London wall-clock strings, same format as the collection.
  start: string;
  end: string;
}

// Local times are handled as "floating" UTC dates so no timezone maths is needed.
function toDate(local: string): Date {
  const [d, t = '00:00'] = local.split('T');
  return new Date(`${d}T${t}:00Z`);
}

function toLocal(date: Date, allDay: boolean): string {
  const iso = date.toISOString();
  return allDay ? iso.slice(0, 10) : iso.slice(0, 16);
}

export function occurrences(event: EventEntry): Occurrence[] {
  const { start, end, rrule, allDay } = event.data;
  if (!rrule) return [{ event, start, end }];
  const dtstart = toDate(start);
  const duration = toDate(end).getTime() - dtstart.getTime();
  const rule = new RRule({ ...RRule.parseString(rrule), dtstart });
  return rule
    .all((_, i) => i < 500)
    .map((d) => ({
      event,
      start: toLocal(d, allDay),
      end: toLocal(new Date(d.getTime() + duration), allDay),
    }));
}

export async function allOccurrences(): Promise<Occurrence[]> {
  const events = await getCollection('events');
  return events.flatMap(occurrences).sort((a, b) => a.start.localeCompare(b.start));
}

export { londonNow };

// Occurrences that have not ended yet. Compares local strings, all-day ends cover the whole day.
export function notEnded(list: Occurrence[], now = londonNow()): Occurrence[] {
  return list.filter((o) => (o.event.data.allDay ? `${o.end}T23:59` : o.end) >= now);
}

export function formatWhen(o: Occurrence): string {
  const day = (s: string) =>
    toDate(s).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const time = (s: string) => s.slice(11, 16);
  if (o.event.data.allDay) {
    return o.start === o.end ? day(o.start) : `${day(o.start)} - ${day(o.end)}`;
  }
  return o.start.slice(0, 10) === o.end.slice(0, 10)
    ? `${day(o.start)}, ${time(o.start)} - ${time(o.end)}`
    : `${day(o.start)} ${time(o.start)} - ${day(o.end)} ${time(o.end)}`;
}

export const categoryLabels: Record<EventEntry['data']['category'], string> = {
  academic: 'Academic',
  ents: 'Ents',
  formal: 'Formal Halls',
  freshers: "Freshers' Fortnight",
  'sans-frontieres': 'Sans Frontières',
  welfare: 'Welfare',
};
