import type { EventEntry } from './events';
import { categoryLabels } from './events';

const TZID = 'Europe/London';
const CALNAME = 'Samuel Butler Room';

// Static Europe/London definition (EU DST rules, unchanged since 1996).
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'X-LIC-LOCATION:Europe/London',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// "YYYY-MM-DD" -> "YYYYMMDD", "YYYY-MM-DDTHH:MM" -> "YYYYMMDDTHHMM00".
export function icsLocal(local: string): string {
  const [d, t] = local.split('T');
  const date = d.replaceAll('-', '');
  return t ? `${date}T${t.replace(':', '')}00` : date;
}

// Day after a "YYYY-MM-DD" date, as iCalendar all-day ends are exclusive.
export function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Folds a content line to 75 octets per RFC 5545 without splitting UTF-8 characters.
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// Markdown body reduced to plain text: links become "label (url)", emphasis markers dropped.
export function plainText(md: string | undefined): string {
  return (md ?? '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/[*_`]+/g, '')
    .trim();
}

export interface IcsOptions {
  // Absolute URL of the site root, used for event URLs.
  site: URL;
  base: string;
  now?: Date;
}

function vevent(event: EventEntry, opts: IcsOptions): string[] {
  const { title, start, end, allDay, rrule, location, category, ticketUrl, tbc } = event.data;
  const pageUrl = new URL(`${opts.base.replace(/\/$/, '')}/events/${event.id}`, opts.site).href;
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const details = [
    plainText(event.body),
    ticketUrl ? `Tickets: ${ticketUrl}` : '',
    tbc ? 'Date to be confirmed.' : '',
    pageUrl,
  ]
    .filter(Boolean)
    .join('\n\n');

  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@sbr-reloaded`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${icsLocal(start)}` : `DTSTART;TZID=${TZID}:${icsLocal(start)}`,
    allDay ? `DTEND;VALUE=DATE:${icsLocal(nextDay(end))}` : `DTEND;TZID=${TZID}:${icsLocal(end)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule.replace(/^RRULE:/, '')}`);
  lines.push(
    `SUMMARY:${escapeText(tbc ? `${title} (date tbc)` : title)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(details)}`,
    `CATEGORIES:${escapeText(categoryLabels[category])}`,
    `URL:${pageUrl}`,
    `STATUS:${tbc ? 'TENTATIVE' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
  );
  return lines;
}

// Builds a VCALENDAR document containing the given events.
export function buildCalendar(events: EventEntry[], opts: IcsOptions, name = CALNAME): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Samuel Butler Room//SBR Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    ...VTIMEZONE,
    ...events.flatMap((e) => vevent(e, opts)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
