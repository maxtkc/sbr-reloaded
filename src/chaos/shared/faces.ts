// Game roster: committee members with a photo and inGames set, with their face crops (from scripts/faces).
// Build-time only (uses astro:content); pages pass the result to client code as JSON.
import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export interface RosterMember {
  slug: string;
  name: string;
  role: string;
  bio: string;
  // Circular-masked face, 256px.
  face: string;
  // Background-removed head and shoulders, 256px.
  cutout: string;
}

const crops = import.meta.glob<{ default: ImageMetadata }>('/src/assets/faces/*.png', {
  eager: true,
});

function crop(slug: string, suffix: '' | '.cutout'): ImageMetadata | undefined {
  return crops[`/src/assets/faces/${slug}${suffix}.png`]?.default;
}

export async function getRoster(): Promise<RosterMember[]> {
  const members = (await getCollection('committee'))
    .filter((m) => m.data.inGames && m.data.photo)
    .sort((a, b) => a.data.order - b.data.order);
  const roster: RosterMember[] = [];
  for (const m of members) {
    const face = crop(m.id, '');
    const cutout = crop(m.id, '.cutout');
    // Skip members whose crops have not been generated yet.
    if (!face || !cutout) continue;
    const opts = { width: 256, format: 'webp' as const };
    roster.push({
      slug: m.id,
      name: m.data.name,
      role: m.data.role,
      bio: m.data.bio,
      face: (await getImage({ src: face, ...opts })).src,
      cutout: (await getImage({ src: cutout, ...opts })).src,
    });
  }
  return roster;
}
