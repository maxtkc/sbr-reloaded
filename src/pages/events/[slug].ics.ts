import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { buildCalendar, icsResponse } from '../../lib/ics';

export const getStaticPaths = (async () => {
  const events = await getCollection('events');
  return events.map((event) => ({ params: { slug: event.id }, props: { event } }));
}) satisfies GetStaticPaths;

// Single-event calendar file (recurring events include their RRULE).
export const GET: APIRoute<{ event: CollectionEntry<'events'> }> = ({ props, site }) => {
  const { event } = props;
  const body = buildCalendar(
    [event],
    { site: site!, base: import.meta.env.BASE_URL },
    event.data.title,
  );
  return icsResponse(body, `${event.id}.ics`);
};
