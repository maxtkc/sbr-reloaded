import type { EventEntry } from './events';
import { icsLocal, nextDay, plainText } from './ics';

// London UTC offset ("+00:00" or "+01:00") at a local wall-clock time.
function londonOffset(local: string): string {
  const [d, t = '12:00'] = local.split('T');
  const guess = new Date(`${d}T${t}:00Z`);
  const shown = guess
    .toLocaleString('sv-SE', { timeZone: 'Europe/London', hour12: false })
    .replace(' ', 'T');
  const diffMin = Math.round((new Date(`${shown}Z`).getTime() - guess.getTime()) / 60000);
  const sign = diffMin < 0 ? '-' : '+';
  const abs = Math.abs(diffMin);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Google Calendar "create event" link, including recurrence.
export function googleEventLink(event: EventEntry, pageUrl: string): string {
  const { title, start, end, allDay, rrule, location } = event.data;
  const dates = allDay
    ? `${icsLocal(start)}/${icsLocal(nextDay(end))}`
    : `${icsLocal(start)}/${icsLocal(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates,
    details: `${plainText(event.body)}\n\n${pageUrl}`,
    location,
  });
  if (!allDay) params.set('ctz', 'Europe/London');
  if (rrule) params.set('recur', `RRULE:${rrule.replace(/^RRULE:/, '')}`);
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Outlook.com compose link. Outlook deeplinks cannot carry recurrence, so this adds one occurrence.
export function outlookEventLink(event: EventEntry, pageUrl: string): string {
  const { title, start, end, allDay, location } = event.data;
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    body: `${plainText(event.body)}\n\n${pageUrl}`,
    location,
  });
  if (allDay) {
    params.set('startdt', start);
    params.set('enddt', nextDay(end));
    params.set('allday', 'true');
  } else {
    params.set('startdt', `${start}:00${londonOffset(start)}`);
    params.set('enddt', `${end}:00${londonOffset(end)}`);
  }
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

// Subscribe links for the whole calendar feed at an absolute https URL.
export function subscribeLinks(icsUrl: string) {
  const webcal = icsUrl.replace(/^https?:/, 'webcal:');
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?${new URLSearchParams({
      url: icsUrl,
      name: 'Samuel Butler Room',
    })}`,
  };
}
