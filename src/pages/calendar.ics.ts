import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildCalendar, icsResponse } from '../lib/ics';

// Full subscribable calendar of every event.
export const GET: APIRoute = async ({ site }) => {
  const events = (await getCollection('events')).sort((a, b) => a.id.localeCompare(b.id));
  const body = buildCalendar(events, { site: site!, base: import.meta.env.BASE_URL });
  return icsResponse(body, 'sbr.ics');
};
