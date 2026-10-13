// Converts a "Submit an event" issue form body into src/content/events/<slug>.md.
// Usage: node to-event.mjs <event.json>   (defaults to $GITHUB_EVENT_PATH)
// Writes `slug` and `path` to $GITHUB_OUTPUT when set.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { toFrontmatter } from '../lib/yaml-format.mjs';

const categories = {
  Academic: 'academic',
  Ents: 'ents',
  'Formal Halls': 'formal',
  "Freshers' Fortnight": 'freshers',
  'Sans Frontieres': 'sans-frontieres',
};

// Splits "### Label\n\nvalue" blocks into { label: value }.
export function parseForm(body) {
  const fields = {};
  const parts = body.replace(/\r\n/g, '\n').split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = part.slice(0, nl).trim();
    const value = part.slice(nl + 1).trim();
    fields[label] = value === '_No response_' ? '' : value;
  }
  return fields;
}

function fail(msg) {
  throw new Error(msg);
}

function addMinutes(date, time, minutes) {
  const d = new Date(`${date}T${time}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

function nextDay(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
    .replace(/-$/, '');
}

export function toEvent(body) {
  const f = parseForm(body);
  const title = f['Event name'] || fail('Missing event name');
  const date = f['Date'];
  const startTime = f['Start time'];
  const endTime = f['End time'];
  const endDate = f['Last day (multi-day all-day events only)'];
  const location = f['Location'] || fail('Missing location');
  const category = categories[f['Category']] || fail(`Unknown category: ${f['Category']}`);
  const description = f['Description'] || fail('Missing description');
  const ticketUrl = f['Ticket link'];

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!dateRe.test(date) || isNaN(Date.parse(date))) fail(`Bad date "${date}", use YYYY-MM-DD`);
  if (endDate && (!dateRe.test(endDate) || endDate < date)) fail(`Bad last day "${endDate}"`);
  if (startTime && !timeRe.test(startTime)) fail(`Bad start time "${startTime}", use HH:MM`);
  if (endTime && !timeRe.test(endTime)) fail(`Bad end time "${endTime}", use HH:MM`);
  if (endTime && !startTime) fail('End time given without a start time');
  if (ticketUrl && !/^https?:\/\/\S+$/.test(ticketUrl)) fail(`Bad ticket link "${ticketUrl}"`);

  const allDay = !startTime;
  let start, end;
  if (allDay) {
    start = date;
    end = endDate || date;
  } else if (endTime) {
    start = `${date}T${startTime}`;
    end = `${endTime < startTime ? nextDay(date) : date}T${endTime}`;
  } else {
    start = `${date}T${startTime}`;
    end = addMinutes(date, startTime, 120);
  }

  const slug = `${slugify(title) || 'event'}-${date}`;
  const data = { title, start, end, allDay, location, category };
  if (ticketUrl) data.ticketUrl = ticketUrl;
  return { slug, content: toFrontmatter(data, description) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
  const { issue } = JSON.parse(readFileSync(eventPath, 'utf8'));
  const { slug, content } = toEvent(issue.body || '');
  const path = `src/content/events/${slug}.md`;
  if (existsSync(path)) fail(`${path} already exists`);
  writeFileSync(path, content);
  console.log(`Wrote ${path}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `slug=${slug}\npath=${path}\n`);
}
