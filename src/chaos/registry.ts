// Single switchboard for all gags and games. Disable or remove entries here to roll back.
import animatedLogo from './gags/animated-logo';

export interface Gag {
  enabled: boolean;
  init: () => void | (() => void);
}

export interface GameModule {
  // Starts the game inside root and returns a cleanup function.
  default: (root: HTMLElement) => () => void;
}

export interface Game {
  title: string;
  // CSS selector for elements that launch the game, in addition to [data-game="<slug>"].
  trigger: string;
  touch: boolean;
  load: () => Promise<GameModule>;
}

export const gags: Record<string, Gag> = {
  'animated-logo': { enabled: true, init: animatedLogo },
};

export const games: Record<string, Game> = {};
