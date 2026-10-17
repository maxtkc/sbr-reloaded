// Peeking characters drawn upright in a 36x48 box: head and hat on top, the bottom part stays hidden behind
// the host element's edge. Each opens one daily puzzle.
export interface Character {
  id: string;
  name: string;
  slug: string;
  svg: string;
  // Wagging tail instead of a bobbing head.
  tail?: boolean;
}

const INK = '#222';
const SKIN = '#f5cba7';

// Beanie with horizontal stripes, clipped to the hat shape.
function beanie(id: string, a: string, b: string, bobble: string): string {
  const stripes = [9, 13, 17]
    .map((y) => `<rect x="0" y="${y}" width="36" height="2" fill="${b}"/>`)
    .join('');
  return `<clipPath id="${id}-hat"><path d="M7 21Q7 7 18 7Q29 7 29 21Z"/></clipPath>
<path d="M7 21Q7 7 18 7Q29 7 29 21Z" fill="${a}" stroke="${INK}" stroke-width=".8"/>
<g clip-path="url(#${id}-hat)">${stripes}</g>
<rect x="6" y="19" width="24" height="3.5" rx="1.5" fill="${b}" stroke="${INK}" stroke-width=".8"/>
<circle cx="18" cy="5" r="3.4" fill="${bobble}" stroke="${INK}" stroke-width=".8"/>`;
}

function face(extra = ''): string {
  return `<ellipse cx="18" cy="30" rx="8.5" ry="10" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
<path d="M17.5 30.5q.8 1.6 1.8.2" fill="none" stroke="${INK}" stroke-width=".7"/>${extra}`;
}

function glasses(fill = '#fff', pupils = true): string {
  const eye = (x: number) =>
    `<circle cx="${x}" cy="27" r="3" fill="${fill}" stroke="${INK}" stroke-width="1.1"/>` +
    (pupils ? `<circle cx="${x + 0.4}" cy="27.4" r="1" fill="${INK}"/>` : '');
  return `${eye(14)}${eye(22)}<path d="M17 27h2" stroke="${INK}" stroke-width="1"/>`;
}

const smile = `<path d="M15 35q3 2.2 6 0" fill="none" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/>`;

function stripedCollar(a: string, b: string): string {
  return `<rect x="5" y="40" width="26" height="8" fill="${a}"/><rect x="5" y="43" width="26" height="2" fill="${b}"/>`;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">${body}</svg>`;

export const characters: Character[] = [
  {
    id: 'waldo',
    name: 'Waldo',
    slug: 'daily-wordle',
    svg: svg(
      stripedCollar('#d8232a', '#fff') +
        `<ellipse cx="9" cy="24" rx="2.6" ry="3.5" fill="#6b3d1f"/><ellipse cx="27" cy="24" rx="2.6" ry="3.5" fill="#6b3d1f"/>` +
        face(smile) +
        glasses() +
        beanie('wd', '#d8232a', '#fff', '#fff'),
    ),
  },
  {
    id: 'wenda',
    name: 'Wenda',
    slug: 'daily-connections',
    svg: svg(
      stripedCollar('#d8232a', '#fff') +
        `<path d="M8 20Q4 34 7 44L13 42Q10 32 12 22ZM28 20Q32 34 29 44L23 42Q26 32 24 22Z" fill="#7a4a24"/>` +
        face(
          `<path d="M15.5 35q2.5 1.8 5 0" fill="none" stroke="#c0392b" stroke-width="1.2" stroke-linecap="round"/>`,
        ) +
        glasses() +
        beanie('we', '#d8232a', '#fff', '#d8232a'),
    ),
  },
  {
    id: 'whitebeard',
    name: 'Wizard Whitebeard',
    slug: 'daily-worldle',
    svg: svg(
      `<rect x="5" y="40" width="26" height="8" fill="#c0392b"/>` +
        face() +
        `<path d="M9 31Q9 47 18 48Q27 47 27 31Q22 35 18 33Q14 35 9 31Z" fill="#fff" stroke="${INK}" stroke-width=".7"/>` +
        `<path d="M12 24.5l4 .8M24 24.5l-4 .8" stroke="#ddd" stroke-width="1.6" stroke-linecap="round"/>` +
        `<circle cx="14.5" cy="27.5" r="1.1" fill="${INK}"/><circle cx="21.5" cy="27.5" r="1.1" fill="${INK}"/>` +
        `<clipPath id="wb-hat"><path d="M6 22L18 0L30 22Z"/></clipPath>` +
        `<path d="M6 22L18 0L30 22Z" fill="#c0392b" stroke="${INK}" stroke-width=".8"/>` +
        `<g clip-path="url(#wb-hat)"><rect x="0" y="9" width="36" height="2.2" fill="#fff"/><rect x="0" y="15" width="36" height="2.2" fill="#fff"/></g>` +
        `<rect x="4" y="20" width="28" height="3" rx="1.5" fill="#fff" stroke="${INK}" stroke-width=".8"/>`,
    ),
  },
  {
    id: 'odlaw',
    name: 'Odlaw',
    slug: 'daily-mini',
    svg: svg(
      stripedCollar('#f1c40f', INK) +
        face(
          `<path d="M12.5 33q2.8-2.2 5.5-.6q2.7-1.6 5.5.6q-2.7.6-5.5-.2q-2.8.8-5.5.2Z" fill="${INK}"/>`,
        ) +
        glasses('#333', false) +
        beanie('od', '#f1c40f', INK, INK),
    ),
  },
  {
    id: 'woof',
    name: 'Woof',
    slug: 'daily-bee',
    tail: true,
    svg: svg(
      `<clipPath id="wf-tail"><path d="M13 48Q11 30 18 18Q22 10 19 3Q29 7 28 18Q26 30 24 48Z"/></clipPath>` +
        `<path d="M13 48Q11 30 18 18Q22 10 19 3Q29 7 28 18Q26 30 24 48Z" fill="#fff" stroke="${INK}" stroke-width=".9"/>` +
        `<g clip-path="url(#wf-tail)"><rect x="0" y="6" width="36" height="3" fill="#d8232a"/><rect x="0" y="12" width="36" height="3" fill="#d8232a"/></g>`,
    ),
  },
];
