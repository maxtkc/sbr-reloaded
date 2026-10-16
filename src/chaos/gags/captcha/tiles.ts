// Flat inline SVG tiles for the image challenge. The fox tile morphs into a cat.

export interface Tile {
  label: string;
  fox: boolean;
  svg: string;
}

const svg = (body: string, bg: string) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/>${body}</svg>`;

// One face whose features tween from fox to cat: each path holds the fox shape in `d`, and `.cap-morph` swaps in the
// cat shape via CSS `d` (same commands, so browsers that support it interpolate).
const FOX = svg(
  `<path class="cap-fur cap-earl" d="M16 50 L26 8 L46 34 Z"/><path class="cap-fur cap-earr" d="M84 50 L74 8 L54 34 Z"/>
  <path class="cap-inner cap-inl" d="M23 40 L27 18 L38 33 Z"/><path class="cap-inner cap-inr" d="M77 40 L73 18 L62 33 Z"/>
  <path class="cap-fur cap-head" d="M12 38 C25 38 37 38 50 38 C63 38 75 38 88 38 C84 50 70 80 50 94 C30 80 16 50 12 38 Z"/>
  <path class="cap-mask" d="M18 52 C29 66 40 80 50 94 C60 80 71 66 82 52 C71 58 61 64 50 70 C39 64 29 58 18 52 Z"/>
  <path class="cap-eye cap-eyel" d="M29 48 C32 44 38 46 41 51 C37 53 31 52 29 48 Z"/>
  <path class="cap-eye cap-eyer" d="M71 48 C68 44 62 46 59 51 C63 53 69 52 71 48 Z"/>
  <ellipse class="cap-pupil" cx="37" cy="54" rx="1.6" ry="5"/><ellipse class="cap-pupil" cx="63" cy="54" rx="1.6" ry="5"/>
  <path class="cap-nose" d="M45 87 C45 82 55 82 55 87 C55 92 50 93 50 93 C50 93 45 92 45 87 Z"/>
  <path class="cap-whiskers" d="M44 74 20 70M44 76 20 80M56 74 80 70M56 76 80 80"/>`,
  '#cfe3c1',
);

const BIKE = svg(
  `<circle cx="27" cy="66" r="16" fill="none" stroke="#1d1a17" stroke-width="4"/>
  <circle cx="73" cy="66" r="16" fill="none" stroke="#1d1a17" stroke-width="4"/>
  <path d="M27 66 42 40 66 40 73 66M42 40 50 66 66 40M50 66 27 66M42 40 38 32M32 32h12M66 40 63 28h8" fill="none"
    stroke="#152b4e" stroke-width="4" stroke-linejoin="round"/>`,
  '#dfe8f2',
);

const PUNT = svg(
  `<rect y="66" width="100" height="34" fill="#3d6b8a"/>
  <polygon fill="#7a4a22" points="8,58 92,58 86,70 14,70"/>
  <line x1="62" y1="8" x2="48" y2="92" stroke="#a8190f" stroke-width="3"/>
  <circle cx="58" cy="34" r="6" fill="#e7c3a0"/><rect x="52" y="40" width="12" height="18" fill="#82b3bb"/>
  <rect x="54" y="25" width="8" height="4" fill="#e3261c"/>`,
  '#cfe6f2',
);

const BUS = svg(
  `<rect x="10" y="18" width="80" height="62" rx="6" fill="#e3261c"/>
  <rect x="16" y="26" width="15" height="12" fill="#e9f2f8"/><rect x="35" y="26" width="15" height="12" fill="#e9f2f8"/>
  <rect x="54" y="26" width="15" height="12" fill="#e9f2f8"/><rect x="73" y="26" width="11" height="12" fill="#e9f2f8"/>
  <rect x="16" y="50" width="15" height="12" fill="#e9f2f8"/><rect x="35" y="50" width="15" height="12" fill="#e9f2f8"/>
  <rect x="54" y="50" width="15" height="12" fill="#e9f2f8"/><rect x="73" y="48" width="11" height="26" fill="#1d1a17"/>
  <circle cx="28" cy="82" r="8" fill="#1d1a17"/><circle cx="72" cy="82" r="8" fill="#1d1a17"/>`,
  '#e4e4e4',
);

const SHEEP = svg(
  `<rect x="30" y="64" width="6" height="20" fill="#1d1a17"/><rect x="62" y="64" width="6" height="20" fill="#1d1a17"/>
  <circle cx="34" cy="50" r="15" fill="#fff"/><circle cx="52" cy="44" r="16" fill="#fff"/>
  <circle cx="66" cy="54" r="14" fill="#fff"/><circle cx="44" cy="60" r="14" fill="#fff"/>
  <ellipse cx="80" cy="44" rx="9" ry="12" fill="#1d1a17"/><circle cx="83" cy="41" r="1.8" fill="#fff"/>`,
  '#b9d98f',
);

const EAGLE = svg(
  `<polygon fill="#e3261c" points="50,40 8,18 18,48 40,56"/><polygon fill="#e3261c" points="50,40 92,18 82,48 60,56"/>
  <ellipse cx="50" cy="56" rx="12" ry="20" fill="#e3261c"/><circle cx="50" cy="32" r="9" fill="#e3261c"/>
  <polygon fill="#a8190f" points="56,30 66,34 56,36"/><circle cx="52" cy="29" r="1.6" fill="#1d1a17"/>`,
  '#152b4e',
);

const PINT = svg(
  `<polygon fill="#e9a23b" points="30,30 70,30 66,86 34,86"/><rect x="28" y="20" width="44" height="12" rx="4" fill="#fffaf0"/>
  <polygon fill="none" stroke="#5d564e" stroke-width="2" points="28,20 72,20 66,86 34,86"/>`,
  '#6b4a2b',
);

const GOWN = svg(
  `<polygon fill="#1d1a17" points="36,22 64,22 84,90 16,90"/><polygon fill="#e7c3a0" points="44,22 56,22 50,34"/>
  <polygon fill="#1d1a17" points="36,22 16,60 26,62 40,32"/><polygon fill="#1d1a17" points="64,22 84,60 74,62 60,32"/>
  <rect x="34" y="8" width="32" height="5" fill="#1d1a17"/><rect x="44" y="12" width="12" height="8" fill="#1d1a17"/>`,
  '#d9cfc0',
);

export const fox: Tile = { label: 'a fox', fox: true, svg: FOX };

export const distractors: Tile[] = [
  { label: 'a bicycle', fox: false, svg: BIKE },
  { label: 'a punt', fox: false, svg: PUNT },
  { label: 'a double-decker bus', fox: false, svg: BUS },
  { label: 'a sheep', fox: false, svg: SHEEP },
  { label: 'the college eagle', fox: false, svg: EAGLE },
  { label: 'a pint', fox: false, svg: PINT },
  { label: 'a gown', fox: false, svg: GOWN },
];

// Nine shuffled tiles with 2-4 foxes.
export function grid(): Tile[] {
  const foxes = 2 + Math.floor(Math.random() * 3);
  const pool = [...distractors, ...distractors].sort(() => Math.random() - 0.5);
  const tiles = [...Array<Tile>(foxes).fill(fox), ...pool.slice(0, 9 - foxes)];
  return tiles.sort(() => Math.random() - 0.5);
}
