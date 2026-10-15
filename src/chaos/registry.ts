// Single switchboard for all gags and games. Disable or remove entries here to roll back.
import animatedLogo from './gags/animated-logo';
import assistant from './gags/assistant';
import butler from './gags/butler';
import butlerPhotos from './gags/butler-photos';
import captcha from './gags/captcha';
import gravity from './gags/gravity';
import pong from './gags/pong';
import ragdoll from './gags/ragdoll';

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
  // Text for the close button instead of an X.
  closeLabel?: string;
  // Site path (e.g. '/freshers') where the game opens on page load.
  autoOpen?: string;
  load: () => Promise<GameModule>;
}

export const config = {
  // Solbee intent matcher: keyword hits, or MiniLM embeddings (downloads the model on first message).
  assistantMatcher: 'keyword' as 'keyword' | 'embedding',
};

export const gags: Record<string, Gag> = {
  'animated-logo': { enabled: true, init: animatedLogo },
  assistant: { enabled: true, init: () => assistant(config.assistantMatcher) },
  butler: { enabled: true, init: butler },
  'butler-photos': { enabled: true, init: butlerPhotos },
  captcha: { enabled: true, init: captcha },
  gravity: { enabled: true, init: gravity },
  pong: { enabled: true, init: pong },
  ragdoll: { enabled: true, init: ragdoll },
};

export const games: Record<string, Game> = {
  breakout: {
    title: 'Breakout: Bridge of Sighs',
    trigger: '',
    touch: true,
    load: () => import('../games/breakout'),
  },
  crawl: {
    title: "Freshers' Guide: The Crawl",
    trigger: '',
    touch: true,
    closeLabel: 'Boring mode',
    autoOpen: '/freshers',
    load: () => import('../games/crawl'),
  },
  'crossy-road': {
    title: 'Crossy Road: GSR to SBR',
    trigger: '',
    touch: true,
    load: () => import('../games/crossy-road'),
  },
  'flappy-eagle': {
    title: 'Flappy Eagle',
    trigger: '.arms-anim [data-part^="eagle-"]',
    touch: true,
    load: () => import('../games/flappy-eagle'),
  },
  'flight-sim': {
    title: 'Johnian Flight Simulator',
    trigger: '',
    touch: false,
    load: () => import('../games/flight-sim'),
  },
  gelato: {
    title: "Jack's Gelato Stand",
    trigger: '',
    touch: true,
    load: () => import('../games/gelato'),
  },
  minecraft: {
    title: 'Johncraft',
    trigger: '',
    touch: false,
    load: () => import('../games/minecraft'),
  },
  pokemon: {
    title: 'Pocket Johnians',
    trigger: '',
    touch: true,
    load: () => import('../games/pokemon'),
  },
  qwop: {
    title: "QWOP to St John's",
    trigger: '',
    touch: false,
    load: () => import('../games/qwop'),
  },
};
