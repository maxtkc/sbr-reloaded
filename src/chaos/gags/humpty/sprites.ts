// Inline SVG sprites for the Humpty Dumpty gag: brick wall, Humpty, his broken pile, and King's College men and
// horses (purple and white). Everything faces right, towards the pile.
const INK = '#222';
const SHELL = '#f6efe0';
const SKIN = '#f5cba7';
const RED = '#c8102e';
const PURPLE = '#5a2a82';

// 64x24: stone coping over three courses of offset bricks.
export const WALL = (() => {
  const bricks: string[] = [];
  for (let row = 0; row < 3; row++) {
    const y = 4 + row * 6.67;
    for (let x = row % 2 ? -8 : 0; x < 64; x += 16) {
      const l = Math.max(x, 0);
      const w = Math.min(x + 16, 64) - l;
      bricks.push(
        `<rect x="${l + 0.5}" y="${(y + 0.5).toFixed(2)}" width="${w - 1}" height="5.67" fill="#b5543c"/>`,
      );
    }
  }
  return `<svg viewBox="0 0 64 24" width="64" height="24" aria-hidden="true">
<rect x="0" y="4" width="64" height="20" fill="#e8d9c4"/>${bricks.join('')}
<rect x="-1" y="0" width="66" height="4.5" rx="1" fill="#9aa0a6" stroke="${INK}" stroke-width=".6"/></svg>`;
})();

// 40x50: egg body (bottom of the shell at y 42 rests on the wall), red bow tie, legs dangling over the wall face.
export const HUMPTY = `<svg viewBox="0 0 40 50" width="40" height="50" aria-hidden="true">
<g class="hd-leg"><path d="M15 39v8" stroke="${INK}" stroke-width="2.4"/><ellipse cx="16.5" cy="48" rx="3" ry="1.8" fill="${INK}"/></g>
<g class="hd-leg hd-leg-b"><path d="M25 39v8" stroke="${INK}" stroke-width="2.4"/><ellipse cx="26.5" cy="48" rx="3" ry="1.8" fill="${INK}"/></g>
<path d="M6 26l-4 6M34 26l4 6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>
<path d="M20 2C30 2 35 16 35 26C35 37 28 42 20 42C12 42 5 37 5 26C5 16 10 2 20 2Z" fill="${SHELL}" stroke="${INK}" stroke-width="1"/>
<g class="hd-eyes"><circle cx="15" cy="18" r="3" fill="#fff" stroke="${INK}" stroke-width=".8"/><circle cx="25" cy="18" r="3" fill="#fff" stroke="${INK}" stroke-width=".8"/>
<circle cx="15.6" cy="18.4" r="1.2" fill="${INK}"/><circle cx="25.6" cy="18.4" r="1.2" fill="${INK}"/></g>
<path d="M14 24q6 4 12 0" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
<path d="M13 29l7 3-7 3zM27 29l-7 3 7 3z" fill="${RED}" stroke="${INK}" stroke-width=".6"/>
<circle cx="20" cy="32" r="1.6" fill="${RED}" stroke="${INK}" stroke-width=".6"/></svg>`;

// 56x48: yolk puddle with shell shards (one keeps an eye and the bow tie), plus a taped-up whole egg shown during
// each attempt.
export const PILE = `<svg viewBox="0 0 56 48" width="56" height="48" aria-hidden="true">
<ellipse cx="28" cy="42" rx="27" ry="5.5" fill="#fff8e6" stroke="${INK}" stroke-width=".5"/>
<ellipse cx="29" cy="42" rx="9" ry="3.6" fill="#f4c430"/>
<g class="hd-shards">
<path d="M6 42l3-12 6 5 4-6 3 13z" fill="${SHELL}" stroke="${INK}" stroke-width=".8"/>
<path d="M36 43l2-9 5 3 4-5 4 11z" fill="${SHELL}" stroke="${INK}" stroke-width=".8"/>
<path d="M22 44l4-6 4 3 3-4 2 7z" fill="${SHELL}" stroke="${INK}" stroke-width=".8"/>
<path d="M44 27l5-2 2 5-5 1z" fill="${SHELL}" stroke="${INK}" stroke-width=".7"/>
<g class="hd-blink"><circle cx="11.5" cy="36" r="2.4" fill="#fff" stroke="${INK}" stroke-width=".7"/><circle cx="12" cy="36.3" r="1" fill="${INK}"/></g>
<path d="M39 38l4 2-4 2zM47 38l-4 2 4 2z" fill="${RED}" stroke="${INK}" stroke-width=".5"/>
</g>
<g class="hd-whole">
<path d="M28 6C36 6 40 18 40 26C40 35 35 40 28 40C21 40 16 35 16 26C16 18 20 6 28 6Z" fill="${SHELL}" stroke="${INK}" stroke-width="1"/>
<path d="M18 22l6 3 4-4 5 4 6-3M20 32l5-2 5 3 6-2" fill="none" stroke="${INK}" stroke-width=".7"/>
<path d="M17 15l22 18M39 15L17 33" stroke="#d9c27a" stroke-width="3" opacity=".85"/>
<circle cx="24" cy="18" r="1.4" fill="${INK}"/><circle cx="32" cy="18" r="1.4" fill="${INK}"/>
<path d="M24 27q4-2 8 0" fill="none" stroke="${INK}" stroke-width=".9"/>
</g></svg>`;

// 28x50: mortarboard, black gown with a purple stole, white bands.
export const MAN = `<svg viewBox="0 0 28 50" width="28" height="50" aria-hidden="true">
<path d="M10 40v8M18 40v8" stroke="${INK}" stroke-width="2.4"/>
<path d="M8 49h4M16 49h5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>
<path d="M14 15L4 42h20z" fill="#1a1a1a" stroke="${INK}" stroke-width=".8"/>
<path d="M11 17l-3 24M17 17l3 24" stroke="${PURPLE}" stroke-width="2.6"/>
<path d="M12.5 16h3l-.5 5h-2z" fill="#fff"/>
<path d="M19 22l6 7" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>
<circle cx="14" cy="10" r="6" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>
<circle cx="16" cy="9.5" r=".9" fill="${INK}"/><circle cx="19" cy="9.5" r=".9" fill="${INK}"/>
<path d="M15.5 13q2 1 3.5-.2" fill="none" stroke="${INK}" stroke-width=".7"/>
<path d="M4 4l10-3 10 3-10 3z" fill="#1a1a1a" stroke="${INK}" stroke-width=".6"/>
<path d="M8 5v3.5h12V5" fill="#1a1a1a"/><path d="M21 3.7v6" stroke="${PURPLE}" stroke-width="1.2"/></svg>`;

// 60x44: brown horse in a purple caparison with white trim and a white rose.
export const HORSE = `<svg viewBox="0 0 60 44" width="60" height="44" aria-hidden="true">
<path d="M14 24q-8 2-9 12" fill="none" stroke="#3b2414" stroke-width="3" stroke-linecap="round"/>
<path d="M17 28v14M23 29v13M38 29v13M44 28v14" stroke="#7a4a22" stroke-width="3.4"/>
<path d="M15 42h4M21 42h4M36 42h4M42 42h4" stroke="${INK}" stroke-width="2"/>
<ellipse cx="30" cy="24" rx="17" ry="8.5" fill="#8b5a2b" stroke="${INK}" stroke-width=".8"/>
<path d="M42 20l7-12 9 4-2 4-6-1-3 9z" fill="#8b5a2b" stroke="${INK}" stroke-width=".8"/>
<path d="M44 16l4-9" stroke="#3b2414" stroke-width="2.4"/>
<circle cx="53" cy="10" r=".9" fill="${INK}"/>
<path d="M15 18h28l-2 15H17z" fill="${PURPLE}" stroke="#fff" stroke-width="1.2"/>
<circle cx="29" cy="25" r="3.2" fill="#fff"/><circle cx="29" cy="25" r="1.2" fill="#f4c430"/></svg>`;
