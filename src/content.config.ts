import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Local wall-clock time in Europe/London: "YYYY-MM-DD" (all-day) or "YYYY-MM-DDTHH:MM".
// Unquoted YAML dates (as written by the CMS) arrive as UTC-midnight Date objects, so map them back.
const localDateTime = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Use YYYY-MM-DD or YYYY-MM-DDTHH:MM'),
);

export const eventCategories = [
  'academic',
  'ents',
  'formal',
  'freshers',
  'sans-frontieres',
] as const;

// Landing page and subpage text blocks.
const sections = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sections' }),
  schema: z.object({
    title: z.string(),
    page: z.enum(['home', 'events', 'facilities', 'committee', 'quicklinks', 'history', 'footer']),
    order: z.number(),
    category: z.enum(eventCategories).optional(),
    author: z.string().optional(),
  }),
});

const committee = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/committee' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      role: z.string(),
      email: z.email(),
      order: z.number(),
      photo: image().optional(),
      // Only members with a photo appear in games.
      inGames: z.boolean().default(false),
      bio: z.string().default(''),
    }),
});

const quicklinks = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/quicklinks' }),
  schema: z.object({
    label: z.string(),
    url: z.string(),
    group: z.string(),
    order: z.number(),
    // Shown in the landing page quick links strip.
    featured: z.boolean().default(false),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    start: localDateTime,
    end: localDateTime,
    allDay: z.boolean().default(false),
    rrule: z.string().optional(),
    location: z.string(),
    category: z.enum(eventCategories),
    ticketUrl: z.url().optional(),
    // Placeholder date, shown as "to be confirmed".
    tbc: z.boolean().default(false),
  }),
});

const gallery = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/gallery' }),
  schema: ({ image }) =>
    z.object({
      image: image(),
      alt: z.string(),
      caption: z.string().optional(),
      date: z.string().optional(),
      order: z.number().default(0),
    }),
});

const instagram = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/instagram' }),
  schema: z.object({
    url: z.url().regex(/^https:\/\/www\.instagram\.com\/(p|reel)\/[\w-]+\/?$/),
    caption: z.string().optional(),
    order: z.number().default(0),
  }),
});

// Free-form joke and copy data for gags and games, keyed by file name.
const jokes = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/jokes' }),
  schema: z.record(z.string(), z.unknown()),
});

export const collections = { sections, committee, quicklinks, events, gallery, instagram, jokes };
