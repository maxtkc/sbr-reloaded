// Flat inline SVG tiles for the image challenge. The fox tile holds a cat underneath and morphs into it.

export interface Tile {
  label: string;
  fox: boolean;
  svg: string;
}

const svg = (body: string, bg: string) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/>${body}</svg>`;

// Ears are shared and shrink; the fox and cat faces crossfade on top of them.
const FOX = svg(
  `<g class="cap-ears">
    <polygon class="cap-fur" points="16,50 26,8 46,34"/><polygon class="cap-fur" points="84,50 74,8 54,34"/>
    <polygon fill="#3a2418" points="23,40 27,18 38,33"/><polygon fill="#3a2418" points="77,40 73,18 62,33"/>
  </g>
  <g class="cap-fox">
    <polygon class="cap-fur" points="12,38 88,38 76,66 50,94 24,66"/>
    <polygon fill="#fff" points="18,52 50,94 82,52 50,70"/>
    <ellipse cx="35" cy="50" rx="5" ry="3" fill="#1d1a17"/><ellipse cx="65" cy="50" rx="5" ry="3" fill="#1d1a17"/>
    <circle cx="50" cy="88" r="5" fill="#1d1a17"/>
  </g>
  <g class="cap-cat">
    <circle class="cap-fur" cx="50" cy="60" r="34"/>
    <ellipse cx="50" cy="74" rx="14" ry="10" fill="#e8e2da"/>
    <circle cx="37" cy="54" r="6" fill="#9bc53d"/><circle cx="63" cy="54" r="6" fill="#9bc53d"/>
    <ellipse cx="37" cy="54" rx="1.6" ry="5" fill="#1d1a17"/><ellipse cx="63" cy="54" rx="1.6" ry="5" fill="#1d1a17"/>
    <polygon fill="#e58fa0" points="46,68 54,68 50,73"/>
    <path d="M44 74 20 70M44 76 20 80M56 74 80 70M56 76 80 80" stroke="#1d1a17" stroke-width="1.2"/>
  </g>`,
  '#cfe3c1',
);

const BIKE = svg(
  `<circle cx="27" cy="66" r="16" fill="none" stroke="#1d1a17" stroke-width="4"/>
  <circle cx="73" cy="66" r="16" fill="none" stroke="#1d1a17" stroke-width="4"/>
  <path d="M27 66 42 40 66 40 73 66M42 40 50 66 66 40M50 66 27 66M42 40 38 32M32 32h12M66 40 63 28h8" fill="none"
    stroke="#a3162b" stroke-width="4" stroke-linejoin="round"/>`,
  '#dfe8f2',
);

const PUNT = svg(
  `<rect y="66" width="100" height="34" fill="#3d6b8a"/>
  <polygon fill="#7a4a22" points="8,58 92,58 86,70 14,70"/>
  <line x1="62" y1="8" x2="48" y2="92" stroke="#806600" stroke-width="3"/>
  <circle cx="58" cy="34" r="6" fill="#e7c3a0"/><rect x="52" y="40" width="12" height="18" fill="#1f3d7a"/>
  <rect x="54" y="25" width="8" height="4" fill="#d1b948"/>`,
  '#cfe6f2',
);

const BUS = svg(
  `<rect x="10" y="18" width="80" height="62" rx="6" fill="#c8102e"/>
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
  `<polygon fill="#d1b948" points="50,40 8,18 18,48 40,56"/><polygon fill="#d1b948" points="50,40 92,18 82,48 60,56"/>
  <ellipse cx="50" cy="56" rx="12" ry="20" fill="#d1b948"/><circle cx="50" cy="32" r="9" fill="#d1b948"/>
  <polygon fill="#806600" points="56,30 66,34 56,36"/><circle cx="52" cy="29" r="1.6" fill="#1d1a17"/>`,
  '#a3162b',
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
