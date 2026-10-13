// Phrases in rendered markdown that get wrapped in <span data-game="<slug>"> as easter egg triggers.
// Matches inside links are skipped. Remove an entry (or empty the list) to drop its hook.
export const phraseHooks = [
  { pattern: /TV with a Wii/, game: 'minecraft' },
  { pattern: /pool table/, game: 'eight-ball' },
  { pattern: /Port (?:&|and) Sherry/i, game: 'doodle-jump' },
  { pattern: /sBrOILER ROOMS?/i, game: 'pacman' },
  { pattern: /\bSwaps\b/, game: 'operation' },
  { pattern: /All Saints Passage/, game: 'crossy-road' },
  { pattern: /CB2 1TP/, game: 'flight-sim' },
  { pattern: /sinking passing punts/, game: 'bumps' },
  { pattern: /Cycling in Cambridge/, game: 'bike-dino' },
];
