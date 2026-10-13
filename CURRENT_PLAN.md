# SBR Reloaded - CURRENT_PLAN.md

## Context
Rebuild https://sites.google.com/cam.ac.uk/sbr/ (Samuel Butler Room, the St John's College Cambridge postgrad
society) as a static Astro site: a real replacement for the official Google Site (mostly one landing page, plus a few
subpages), with a git-backed CMS, an exportable calendar, a gallery, and Instagram embeds. On top of that it gets a
heavy layer of satire: page-wide gags and ~16 hidden mini-games. Chaos is on everywhere with no off switch for now.
It will be rolled back before go-live, so every gag and game must register through one registry and be removable
in one place.

## How to use this file (for the implementing agent)
- Work phases in order. Each phase is self-contained: read "Global conventions" + the phase, then implement.
- Start of phase: set its status to `[~]`. End: `astro build` passes, run the phase's manual checklist yourself
  where possible (dev server + browser), set status to `[x]`, commit directly to `main` with a short message
  (`phase N: <what>`), push.
- If a phase hits a decision not covered here, pick the simplest option, note it under that phase's "Notes",
  and continue. If a phase is blocked on a user action (see "User actions"), skip it, mark `[!]`, continue.
- Jokes/copy: draft them yourself into the phase's data file. The user edits later.
- Global writing rules: no em-dashes, no emojis, no arrow or middle-dot characters (use "->" or "-"). Short comments
  describing what code does.

## Decisions (fixed)
| Area | Decision |
|---|---|
| Framework | Astro (static output), TypeScript, content collections |
| Hosting | GitHub Pages via Actions, repo `maxtkc/sbr-reloaded` (public), `site: https://maxtkc.github.io`, `base: /sbr-reloaded`. All internal URLs go through a `url()` helper so a custom domain later is a config change |
| CMS | Sveltia CMS (Decap-compatible `config.yml`) at `/admin`, GitHub backend, OAuth via free-tier Cloudflare Worker (`sveltia/sveltia-cms-auth`) |
| Editors | A few committee members as repo collaborators. Others submit events via GitHub Issue Form -> Action -> PR adding an event file |
| Events | One markdown file per event in repo (supports RRULE recurrence). Build emits `/calendar.ics` (webcal subscribable), per-event `.ics`, Google/Outlook "add" links |
| Gallery | Images uploaded via CMS into repo, optimized with `astro:assets` |
| Instagram | CMS-managed list of post URLs rendered as `https://www.instagram.com/p/<id>/embed` iframes (lazy), plus Follow @samuelsroom link. No API tokens |
| Style | St John's / LMBC red, heraldic gold and blue from the arms, serif headings, clean modern layout |
| Pages | Landing (everything below) + `/history`, `/freshers`, `/events/<slug>`, `/quick-links`, `/games/<slug>`, `/admin` |
| 2D games | Kaplay. Physics (ragdoll, gravity, 8-ball, QWOP, Operation) with Matter.js |
| 3D | three.js (Minecraft, flight sim) |
| Map data | One OSM extract (Overpass, bbox around St John's) committed as GeoJSON; feeds Pokemon tilemap, Minecraft voxels, flight sim buildings. No API keys anywhere in the project |
| Game launch | Contextual easter eggs only (no arcade page). Trigger opens full-viewport iframe overlay of `/games/<slug>` with an X; every game also works standalone. Page gags pause while a game is open |
| Touch | Basic touch where it maps trivially (tap = flap/jump). Keyboard-heavy games show a joke "desktop only" screen on touch |
| Faces | 9 committee members with photos: face crops used everywhere. 6 without photos: Samuel Butler public-domain portrait on the site, EXCLUDED from games |
| Verification | `astro build` + per-phase manual checklist. No automated test suite |
| Git | Agent commits to `main` at end of each phase and pushes |

## Source content inventory (scraped 2026-10-12)
- Site pages: `/home`, `/events`, `/resources-facilities`, `/committee`, `/quick-links` under `https://sites.google.com/cam.ac.uk/sbr`
- Home: welcome (SBR = society, committee, and the room at I2 First Court; GSR at 1 All Saints Passage), keep updated,
  history (founded 1960, Samuel Butler at St John's 1854-58), address "The Samuel Butler Room, St John's College, CB2 1TP"
- Events: prose only, no calendar. Academic (grad talks before BA Table, Lent research symposium), Ents (sBrOILER ROOMS,
  end-of-term parties), Formal Halls (dine with fellows via UPay, BA Table Tue+Fri in term, swaps with Balliol, Trinity
  Dublin, Ghislieri, Uppsala, Port & Sherry Fri after hall GBP1.50), Freshers' Fortnight, Sans Frontieres
- Resources: Freshers' Guide 2026-27 PDF (Drive id `1vPmbdIw2yIEAaw-goCRs07Y6I4Q2S2XQ`), Welfare (+ Drive pack
  `1INMCPM8OPaQKwzOlnjgWoykwurdkWop9`, anonymous Google Form), Accommodation, GSR (+ Drive directions
  `1ViIfPf_Ost24ANLH86J42SI4dee2Lo6j`), SBR room (TV + Wii, board games, pool table, piano, kitchen), Julia Powles history
  article, college map image
- Committee: 15 members (Soleh Anderlini - President, has photo). Photos matched to members by layout order on the
  source page (no alt text), so the mapping must be eyeballed
- Quick links: ~30 links (SharePoint, Zendesk, Forms, Moodle) in groups: Quick Links, Requests, Information Packs,
  College Services, Forms, Moodle and Accommodation
- Logo: the St John's College arms (two yales as supporters, gold eagle crest with chained crown). NOT dragons.
  Vector source: Wikimedia Commons `File:Coat of arms of the St John's College.svg` (512x480 Inkscape SVG, ~750KB,
  CC BY-SA 4.0, attribution in footer)

## Repo layout (target)
```
astro.config.mjs
public/admin/{index.html,config.yml}
scripts/                 one-off Node/Python tools (scrape, faces, osm, svg split, pdf). Outputs committed
src/content/             collections: events, committee, quicklinks, gallery, instagram, sections, jokes
src/data/                generated data (osm.geojson, tilemap.json, guide.md, arms parts)
src/assets/              images (faces/, committee/, gallery/, arms/)
src/pages/               index, history, freshers, quick-links, events/[slug], games/[slug], calendar.ics.ts
src/components/          site sections
src/chaos/               registry.ts, overlay.ts, gags/<gag>.ts, shared/{faces.ts,matter.ts,kaplay.ts,sfx.ts}
src/games/<slug>/        index.ts (export default start(root: HTMLElement): () => void), data.json
.github/workflows/       deploy.yml, event-issue.yml
.github/ISSUE_TEMPLATE/  event.yml
```

## Global conventions
- `src/chaos/registry.ts` is the single switchboard: `gags: Record<id, {enabled, init}>` and
  `games: Record<slug, {title, trigger: CSS selector, touch: boolean, load: () => import(...)}>`. Rollback = edit this file.
- Easter egg triggers: elements get `data-game="<slug>"`. The registry also carries a selector so content edited via CMS
  still gets the hook. Click -> `overlay.open(slug)` -> iframe to `/games/<slug>?embed=1`.
- Games: each `start(root)` returns a cleanup fn. Game pages are a shared `GameLayout` (canvas root, title, X/back,
  touch guard). Load committee faces via `shared/faces.ts` (photo members only, with role and bio).
- Every game shows at least one piece of real SBR/St John's info (listed per phase).
- Overlay gags must not break reading the real content beyond the joke, and must not throw on pages without matching
  elements. Respect `prefers-reduced-motion` only by slowing, not disabling (no escape, by request).

## User actions (blocking the phases noted)
1. Create GitHub repo `maxtkc/sbr-reloaded`, enable Pages (source: Actions) - Phase 0 push
2. Create a GitHub OAuth App + deploy `sveltia-cms-auth` to a free Cloudflare Worker, set its URL in `config.yml` - Phase 4
3. Add committee editors as collaborators - after Phase 4
4. Confirm the photo-to-member mapping on the committee section - Phase 1 checklist

---

## Phase 0 - Repo bootstrap  `[x]`
- `git init`, Astro + TS (strict), Prettier. `.gitignore`. Move `TODO.md` content into `docs/original-brief.md`.
- `astro.config.mjs` with `site`/`base`, `url()` helper.
- `.github/workflows/deploy.yml` (withastro/action -> Pages).
- Empty `src/chaos/registry.ts` with types, empty `GameLayout`.
- Checklist: `npm run build` ok; `npm run dev` serves a placeholder at `/sbr-reloaded/`.
- Notes: Astro 7.3.8. TypeScript pinned to 6 because `astro check` does not support TS 7. `npm run build` runs
  `astro check` first. `astro dev` daemonizes in Astro 7 (`astro dev stop` to stop).

## Phase 1 - Content scrape + data model  `[x]`
- `scripts/scrape/`: fetch all 5 Google Site pages, extract text into content collections (markdown/YAML), download
  images (committee photos, college map, decorative footer image), preserve all links. Commit outputs; the scraper is
  a one-off, not run in CI.
- Collections and zod schemas: `sections` (landing text blocks), `committee` (name, role, bio, email, photo?, order,
  inGames), `quicklinks` (group, label, url), `events` (title, start, end, allDay, rrule?, location, description,
  category: academic|ents|formal|freshers|sans-frontieres, ticketUrl?), `gallery`, `instagram` (url, caption?), `jokes`.
- Freshers' Guide: download PDF via `https://drive.google.com/uc?export=download&id=1vPmbdIw2yIEAaw-goCRs07Y6I4Q2S2XQ`,
  `pdftotext -layout`, hand-clean into `src/data/guide.md` with `##` per section.
- Powles history article -> `src/content/sections/history.md`.
- Samuel Butler portrait (public domain, Commons) -> `src/assets/committee/samuel-butler.jpg`.
- Arms SVG from Commons -> `src/assets/arms/arms.svg`.
- Seed events: recurring BA Table (Tue+Fri in full term), Port & Sherry (Fri), plus one-off placeholders for grad talks,
  symposium (Lent), Freshers' Fortnight. Use the real 2026-27 Cambridge full-term dates (look them up).
- Checklist: every scraped link present; 15 committee entries; photo-to-member mapping looks right (user confirms).
- Notes: pipeline is `scripts/scrape/{scrape.py,to_content.py,assets.py}` (system python with bs4, lxml, pyyaml,
  Pillow) and `scripts/guide/extract.py` (venv with pymupdf) producing a draft that was hand-cleaned into
  `src/data/guide.md` (`##` = chapter, `###`/`####` = subsections). Raw page markdown in `scripts/scrape/out/*.md`.
  Photos sit in the same source block as each member's name, so the mapping is structural, not by layout order.
  Source `mailto:` hrefs for 7 members wrongly point at js2430; the displayed (correct) addresses are used.
  Content links are root-relative (`/#committee`, `/history`, `/freshers`); Phase 2 must prefix the base path
  when rendering markdown. Guide links to the old SBR site were rewritten to these paths. Event times are local
  Europe/London strings (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`); placeholder dates carry `tbc: true`. The old site's
  footer image is a raster of the arms (`src/assets/arms/arms-footer.png`). Quick links get `order` and `featured`
  (8 for the landing strip). Em/en dashes in scraped text replaced with hyphens.

## Phase 2 - Landing page + subpages  `[x]`
- Theme tokens (Johns red, arms gold/blue), serif heading font (Google Fonts), responsive.
- Landing sections in order: hero (arms logo, tagline), welcome, upcoming events (next 5) + subscribe buttons,
  "what we do" (event categories from Events page), committee grid (Butler portrait for no-photo members), facilities
  (SBR room, GSR, accommodation, welfare with real links), gallery (stub), Instagram (stub), quick links (top ~8 + link
  to `/quick-links`), history teaser -> `/history`, footer (address, Instagram, attributions: arms CC BY-SA, OSM ODbL).
- Subpages: `/history`, `/freshers` (plain readable guide + "watch the crawl" link), `/quick-links`.
- Add `data-game` hooks on the trigger elements (inert until games exist). Trigger per game is listed in each game
  phase header; logo eagle, Freshers' Guide link, college map, address, Formal Halls/Swaps, Ents, Port & Sherry, pool
  table, Wii, Sports/punt, GSR, Buttery link, Accommodation, history punt mishaps, welfare/footer image, cycling.
- Checklist: all real content reachable; mobile layout ok; no dead links.
- Notes: Astro 7 defaults to the Satteri markdown processor, so `astro.config.mjs` sets
  `markdown.processor: unified({...})` from `@astrojs/markdown-remark` to run two rehype plugins:
  `src/lib/rehype-base-links.mjs` (prefixes root-relative links with the base path) and
  `src/lib/rehype-game-hooks.mjs` (wraps phrases listed in `src/chaos/hooks.mjs` in `<span data-game>`, so
  CMS-edited text keeps its hooks; rollback = empty that list). Component-level hooks: hero logo
  `flappy-eagle`, Freshers' Guide heading + "Watch the crawl" button `crawl`, college map image `pokemon`,
  footer address `flight-sim`, footer arms image `floppy-crow`, Accommodation heading `qwop`, GSR heading
  `crossy-road`, Formal Halls heading `operation`, Ents heading `pacman`, Buttery quick links `gelato`,
  Sports card `breakout`, Environment card `bike-dino`. Phrase hooks: "TV with a Wii" `minecraft`,
  "pool table" `eight-ball`, "Port & Sherry" `doodle-jump`, "sBrOILER ROOMS" `pacman`, "Swaps" `operation`,
  "All Saints Passage" `crossy-road`, "CB2 1TP" `flight-sim`, "sinking passing punts" (history) `bumps`,
  "Cycling in Cambridge" (guide) `bike-dino`. Upcoming events: `src/lib/events.ts` expands RRULEs with
  `rrule` (local times as floating UTC); the page renders 15 upcoming occurrences and a client script
  shows the next 5 not yet ended. Subscribe buttons already point at `/calendar.ics` (Phase 3 creates it).
  Event detail links are left for Phase 3. Hero uses the raster arms (`arms-footer.png`); Phase 8 swaps in
  the inline SVG. Some external links from the source content are dead or restricted (Drive/Forms need
  a cam.ac.uk login; wiggle, upaychilli, tabsfm intranet, lgbt.cusu, sjcjcr in the guide); left as scraped.
  Fixed small source typos (missing spaces, split "Port & Sherry" bold).

## Phase 3 - Events + exportable calendar  `[x]`
- `/events/<slug>` detail pages. Category filter on landing.
- `src/pages/calendar.ics.ts` (use `ical-generator` or similar) with RRULE support, `VTIMEZONE` Europe/London,
  stable UIDs. Per-event `/events/<slug>.ics`.
- Buttons: "Subscribe" (`webcal://` + Google "add by URL" link), "Add to Google/Outlook", "Download .ics".
- Checklist: `.ics` validates (icalendar.org validator); subscribing in Google Calendar shows recurring BA Table.
- Notes: ICS is hand-rolled in `src/lib/ics.ts` (no dependency): static Europe/London `VTIMEZONE`, `TZID` local
  times, all-day `VALUE=DATE` with exclusive end, RFC 5545 escaping and 75-octet folding, UID `<id>@sbr-reloaded`
  (host-independent so a custom domain does not duplicate events), `tbc` events get `STATUS:TENTATIVE` and
  "(date tbc)" in the summary. Add links in `src/lib/calendar-links.ts`: Google template link carries the RRULE;
  Outlook deeplinks cannot carry recurrence, so the Outlook button is shown only for one-off events (recurring ones
  point at the per-event `.ics`). Subscribe buttons (webcal, Google add-by-URL, Outlook add-from-web, download) live
  in `SubscribeButtons.astro`, used on the landing page and every detail page. Landing renders up to 15 upcoming
  occurrences per category; the client filter shows the next 5 live ones for the selected category. Validated by
  parsing with Python `icalendar` + `recurring-ical-events` (correct BST/GMT offsets, 18 BA Table dates per
  Michaelmas/Lent). icalendar.org validation and the Google subscribe test need the deployed URL.

## Phase 4 - CMS + event issue form  `[x]` (needs User action 2 to fully test)
- `public/admin/index.html` loading Sveltia CMS; `config.yml` with GitHub backend, `base_url` = Worker URL, collections
  mirroring Phase 1 schemas (events, committee, sections, quicklinks, gallery, instagram, jokes), media folder for gallery.
- `.github/ISSUE_TEMPLATE/event.yml` issue form (title, date/time, location, category, description, ticket link).
- `.github/workflows/event-issue.yml`: on label `approved`, parse the form body, write `src/content/events/<slug>.md`,
  open a PR referencing the issue.
- Write `docs/cms-setup.md`: OAuth App + Worker deploy steps.
- Checklist: `/admin` loads and lists collections (login once the Worker exists); a test issue with `approved` creates a PR.
- Notes: Sveltia CMS pinned to 0.222.1 (unpkg). `config.yml` validated against the package's JSON schema
  (`schema/sveltia-cms.json`). `base_url` is `https://sveltia-cms-auth.maxtkc.workers.dev`. Dates are plain string
  fields with the same regex as zod (the datetime widget cannot store both `YYYY-MM-DD` and `YYYY-MM-DDTHH:MM`).
  `output.omit_empty_optional_fields` keeps empty optional fields (e.g. `category: ''`) out of files so zod passes.
  Committee/gallery images use collection-level relative media folders (`../../assets/<x>`) so `image()` resolves;
  markdown body images go to `public/uploads`. `sections` is edit-only (no create/delete). `jokes` is a generic
  `title` + `lines` list; structured joke files from later phases are edited in git. Issue form parsing lives in
  `scripts/event-issue/to-event.mjs` (no deps, issue body never reaches a shell); the workflow requires labels
  `event` + `approved`, runs `npm run build` before opening the PR (GITHUB_TOKEN PRs trigger no other workflows),
  and comments on the issue on failure. All-day events store an inclusive last day, matching `ics.ts`. Content YAML uses Sveltia's serializer settings
  (`scripts/lib/yaml-format.mjs`, plain strings, single quotes only when needed); the issue workflow uses the same
  module and `npm run format:content` normalizes existing files. Unquoted `YYYY-MM-DD` frontmatter parses as a Date,
  so the event date schema maps Dates back to strings. Verified
  locally: build passes with generated events, `/admin` renders the login screen with the config loaded. Not yet
  verified: GitHub login and the issue -> PR run (need User action 2 and the repo settings in `docs/cms-setup.md`).

## Phase 5 - Gallery + Instagram  `[x]`
- Gallery: masonry grid + lightbox (small lib or hand-rolled), images from `src/content/gallery`.
- Instagram: lazy iframes from `instagram` collection (seed 3-6 real recent @samuelsroom post URLs if findable, else
  placeholders), Follow button.
- Checklist: gallery responsive; embeds load; adding an item via CMS shows after rebuild.
- Notes: masonry via CSS `columns` (1/2/3 at <560/<900/wider), thumbnails at 480w with 2x density, each linking to a
  1600w `getImage` rendition so it works without JS. Lightbox is a hand-rolled `<dialog>` in `Gallery.astro`
  (prev/next buttons, arrow keys, Esc, backdrop click, horizontal swipe; nav buttons hidden on phones). Gallery is
  seeded with 3 entries reusing repo images (college map, Butler portrait, arms) copied into `src/assets/gallery`.
  Gallery `date` gets the same Date-to-string preprocess as events (unquoted YAML dates). Instagram renders
  `https://www.instagram.com/<p|reel>/<id>/embed` iframes (`loading="lazy"`, fixed 560px height since no Instagram
  script is loaded) with a "View on Instagram" link. No Instagram seed: the profile cannot be read without a login,
  so the section shows only the Follow button until posts are added via the CMS. Verified in headless Chromium at
  375/768/1280px (no horizontal scroll, all lightbox controls) and that the iframe loads only on scroll; the embed
  endpoint allows framing, but a rendered real post is unverified until a real post URL is added.

## Phase 6 - Asset pipeline (faces, arms parts)  `[x]`
- `scripts/faces/` (Python, `-I`, venv): MediaPipe face detection or OpenCV DNN on each committee photo -> square crop
  with padding + circular-mask PNG + background-removed cutout (`rembg`) -> `src/assets/faces/<slug>.{png,cutout.png}`.
  Commit outputs. Soleh's cutout is the AI assistant avatar.
- `scripts/arms/`: split `arms.svg` into `left-yale.svg`, `right-yale.svg`, `eagle-body.svg`, `eagle-wing-l.svg`,
  `eagle-wing-r.svg`, `shield.svg` by group bounding boxes (svgo + a small script; hand-pick group ids if needed).
  Further split yales into head, tongue, horns, tail where groups allow. Record pivot points in `arms-parts.json`.
  If the SVG cannot be split cleanly into these parts within reason: give up on the split, note it, and later phases
  use the whole-image fallbacks.
- `src/chaos/shared/faces.ts` exports the game roster.
- Checklist: all 9 faces centered and recognizable; parts reassemble to the original logo.
- Notes: faces use OpenCV's Haar frontal-face cascade (pinned `opencv-python-headless<5`, 5.x dropped it) instead of
  MediaPipe, plus `rembg` (`u2net_human_seg`) for cutouts, in a uv venv on Python 3.12. Detection missed Laura (face
  turned) and picked Davide's shirt, so both have hand-set boxes in `OVERRIDES`; detected boxes land in
  `scripts/faces/boxes.json`. Crops are 512px PNGs; `faces.ts` serves them as 256px webp via `getImage`.
  `faces.ts` is build-time only (`getRoster()` uses `astro:content`); client code gets the roster as JSON from the
  page. Arms split (`scripts/arms/split.py`, inkscape for bounding boxes, svgo for output) gives 19 parts in
  `src/assets/arms/parts/`, listed back-to-front in `src/data/arms-parts.json` with box and pivot in source
  coordinates: per yale `legs`, `ear`, `horn-back`, `horn-front`, `tongue`, `tail`, body; `eagle-wing-l/r`,
  `eagle-body` (with chain and crown), `shield` (with the coronet's red cap), `coronet`. The forelegs are drawn behind
  the shield in the source. Not split: the yale head (its outline is part of the single body path, so head-bob must
  move the whole yale or skip) and the tail (only the end tuft is a group; the tail itself is in the body path).
  Reassembled parts were checked against the original in headless Chromium: only edge antialiasing differs.

## Phase 7 - Chaos infrastructure  `[x]`
- Registry wiring on every page, overlay iframe (open/close, Esc, pause/resume event bus for gags), `GameLayout`,
  shared Kaplay/Matter bootstraps, tiny `sfx.ts` (WebAudio beeps), "desktop only" touch screen.
- One dummy game `/games/hello` to prove the pipeline, removed at the end of the phase.
- Checklist: clicking a `data-game` element opens and closes the overlay cleanly; standalone URL works.
- Notes: `BaseLayout` loads `src/chaos/client.ts`, which inits enabled gags (each in try/catch) and handles clicks on
  `[data-game]` or a game's `trigger` selector. Only slugs present in `games` open the overlay; other hooks stay inert
  and links keep working. `src/chaos/bus.ts` has `onPause`/`onResume`/`isPaused`; the overlay pauses on open and
  resumes on close. Overlay closes on its X, Esc, or `postMessage({ type: 'chaos:close' })` from the game iframe
  (`GameLayout` sends it on Esc when embedded; standalone Esc/X go to `/`). Touch guard is
  `(hover: none) and (pointer: coarse)` plus `touch: false`. `/games/[slug]` paths come from the registry.
  `shared/kaplay.ts` (`startKaplay`, non-global context), `shared/matter.ts` (`startMatter`, optional `Render`),
  `shared/sfx.ts` (`beep`, `blip`, `boom`, `fanfare`). kaplay/matter-js are dynamic imports, so pages only load them
  when a game does. The `hello` game was verified in headless Chromium (open, X, Esc in parent and iframe, scroll
  lock, standalone, touch guard) and then removed. `startMatter` is type-checked but not yet run.

## Phase 8 - Gag: animated logo  `[ ]`
- Reassemble arms parts in an inline SVG; CSS/WAAPI animations: yale head-bob + tongue flick, horn swivel (independent,
  per heraldic lore), tail swish, eagle occasional wing flap. All of them; user trims later. Fallback: static logo.

## Phase 9 - Gag: Soleh-bot AI assistant  `[ ]`
- Floating chat bubble with Soleh's cutout face. Never helpful.
- `src/content/jokes/assistant.yaml`: ~20 intents (events, welfare, food, formal, rent, PhD, thesis, porters, wifi,
  greeting, help, who-are-you, Samuel Butler, sheep, ...) each with example phrases and 5+ replies, plus fallbacks.
- Matchers behind `assistantMatcher: 'keyword' | 'embedding'` config: keyword/regex (default, instant), and
  Transformers.js `Xenova/all-MiniLM-L6-v2` lazy-loaded on first message, cosine against precomputed intent example
  embeddings (computed in browser on load, cached). Typing indicator, sometimes "thinks" for too long.
- Real info: occasionally gives a real fact wrapped in nonsense (BA Table days, Port & Sherry price).

## Phase 10 - Gag: "Are you a robot"  `[ ]`
- Any form submit / issue-form link / CMS-ish button first shows a fake reCAPTCHA. Ticking it -> "Wrong! Robot detected,
  alerting the porters!" with a porter siren animation, then lets you through after a beat.

## Phase 11 - Gag: pong edges  `[ ]`
- Cursor within ~20px of a viewport edge spawns a ball (fixed-position canvas overlay, pointer-events none except
  paddles). Player paddle on the nearest edge, AI paddle with a random game-roster face on the opposite edge.
  Missed ball smashes a random visible element (shake + crack). Score in corner. No-op on touch.

## Phase 12 - Gag: 3-minute ragdoll  `[ ]`
- After 180s on any page (and every 180s after), a Matter.js ragdoll with a random roster face drops from the top
  into a full-viewport overlay world, lands on the viewport bottom, can be grabbed and flung. Cap count (~5).

## Phase 13 - Gag: gravity collapse  `[ ]`
- Reaching the bottom of the page converts visible elements (leaf-ish blocks: headings, paragraphs, cards, images,
  nav items) into Matter bodies (absolute-positioned clones, originals hidden) that fall and pile up. Stays fallen,
  draggable (Google Gravity style). Reload restores.

## Phase 14 - OSM extract pipeline  `[ ]`
- `scripts/osm/fetch.mjs`: Overpass query for a bbox around St John's (roughly Magdalene Bridge to Trinity St to the
  Backs; include All Saints Passage and Fisher Building), buildings (with `height`/`building:levels`), landuse/leisure
  grass, water (Cam), highways, named POIs. Save `src/data/osm.geojson` + local metric projection helper.
- `scripts/osm/tilemap.mjs`: rasterize to a ~1 tile = 4m grid -> `src/data/tilemap.json`
  (wall/grass/tallgrass/water/path/road/door + names).
- Checklist: rendered debug PNG of tilemap is recognizable as St John's.

## Game phases
Each game phase: build `src/games/<slug>/`, register in the registry with its trigger, data/jokes in `data.json`,
keep graphics simple (shapes + faces), include the listed real info. Checklist for every game: opens from trigger,
playable for 30s without errors, closes cleanly, standalone URL works, touch behaviour as specified.

### Phase 15 - Flappy Eagle  `[ ]`  trigger: logo eagle | touch: yes
- Gold crest eagle from arms parts, real wings flap on input, chained crown jangles. Obstacles: St John's chapel tower /
  Gatehouse pinnacles. Score milestones show SBR facts (founded 1960, etc).

### Phase 16 - Star Wars crawl  `[ ]`  trigger: Freshers' Guide link | touch: tap to speed
- Full `guide.md` as a perspective crawl, "Episode N: <section>" per section, starfield, arrow keys/scroll speed
  control, section skip. Opening "A long time ago in a college far, far away...".

### Phase 17 - Pokemon map  `[ ]`  trigger: college map image | touch: on-screen d-pad (simple)
- Top-down tile game from `tilemap.json`. Tall grass -> random encounters (Wild Porter, Tourist, Goose, Punt tout,
  Supervisor) with a joke battle menu. Committee NPCs at hand-placed spots in `npcs.json` (e.g. Treasurer at the Buttery,
  Welfare at the GSR, President in the SBR at I2 First Court), dialogue from their real bios. A glowing "portal" block
  launches Minecraft.

### Phase 18 - Minecraft  `[ ]`  trigger: portal in Pokemon + "TV with a Wii" text in the SBR room description | touch: desktop-only
- three.js voxel world from `osm.geojson` (~200x200 blocks; buildings as stone columns at height, grass, water, paths),
  greedy-meshed chunks, pointer-lock first-person, break/place blocks. Mobs: many creepers that chase and blow
  craters (very destructive, chain reactions), zombies with roster faces. Signs with real building names.

### Phase 19 - Flight sim  `[ ]`  trigger: address / CB2 1TP | touch: desktop-only
- three.js: OSM buildings extruded by height over a flat ground with OSM-colored landuse and the Cam. Simple arcade
  plane physics (pitch/roll/throttle). Labeled floating markers for SBR, GSR, Chapel, Bridge of Sighs. Attribution: OSM.

### Phase 20 - Breakout: Bridge of Sighs  `[ ]`  trigger: Sports officer / punt mention | touch: drag
- Bricks form the Bridge of Sighs outline (1831, Henry Hutchinson) over the Cam. Paddle is a punt with a pole-wielding
  student. Facts pop on brick break.

### Phase 21 - Crossy Road  `[ ]`  trigger: GSR / All Saints Passage | touch: tap/swipe
- Lanes named after real streets between the GSR and First Court (All Saints Passage, St John's St, Bridge St).
  Traffic: bikes (fast, swarming), delivery scooters, double-decker buses. Goal: reach the SBR.

### Phase 22 - Jack's Gelato stand  `[ ]`  trigger: Buttery/Cafe quick link | touch: yes
- Lemonade-stand loop: each day set price per scoop + number of tubs + flavour picks (weird rotating flavours).
  Random Cambridge weather, tourist coachloads, queue down Bene't St. Daily report. Real info: SBR is in First Court,
  Buttery hours link.

### Phase 23 - QWOP to St John's  `[ ]`  trigger: Accommodation / station | touch: desktop-only
- Matter.js ragdoll runner, Q/W/O/P control thighs/calves. Cartoon Johnian: LMBC red blazer, scarf. Distance markers
  along the real route Station Rd -> Hills Rd -> Regent St -> St Andrew's St -> Sidney St -> Bridge St -> St John's.

### Phase 24 - Crew bumps (redcoats)  `[ ]`  trigger: history punt mishaps / Sports | touch: desktop-only
- Side-scrolling Cam reach (Grassy Corner, Ditton, Plough Reach labels). LMBC boat, red blades. At game start, assign a
  random key to each of the 8 oars (fixed for that game, new set next game). Pressing an oar's key strokes it; uneven
  strokes yaw the boat; hitting the bank is allowed (crash, recover). Catch the boat ahead -> "BUMP!" -> prize screen:
  a willow sprig to put in your hair (drag onto a roster face).

### Phase 25 - Operation: formal plate  `[ ]`  trigger: Swaps / Formal Halls | touch: drag
- Drag hall food items (roast potato, Yorkshire pudding, peas, jus...) onto a plate with Matter collisions. Every
  collision adds a surcharge to a running UPay bill. Real info: BA Table Tue/Fri, swap partners as menu names.

### Phase 26 - Pacman: Fisher Building  `[ ]`  trigger: Ents / sBrOILER ROOMS | touch: swipe
- Maze is the Fisher Building; goal is the dancefloor. Bouncers chase while shouting speech bubbles ("Ticket?",
  "Pay on UPay!", "That's GBP1.50"). Collecting a handle of alcohol turns them into ghosts (frightened mode).

### Phase 27 - Doodle Jump: porters  `[ ]`  trigger: Port & Sherry | touch: tilt/tap sides
- Climb up the Chapel tower on platforms (gowns, hall benches, sherry glasses). Porters patrol and shout
  "Get off the grass!", "Port & Sherry is Fridays only!".

### Phase 28 - Bike dino: Mill Road  `[ ]`  trigger: Environment / cycling | touch: tap jump
- Chrome dino runner on a bike. Obstacles: potholes, bus stops, Lime scooters, roadworks. Distance in real Mill Road
  landmarks.

### Phase 29 - Impossible 8-ball  `[ ]`  trigger: pool table (SBR room) | touch: drag to aim
- Matter.js pool table (the SBR's real table). When a ball nears a pocket, a random roster face pops up in the pocket
  and blocks it with a role-specific quip. Never winnable.

### Phase 30 - Floppy Crow  `[ ]`  trigger: welfare / footer image | touch: yes
- Crow flapper with deliberately floppy physics, ceiling hazard of St John's Chapel roofline / gothic arches, foxes on the ground that jump to
  catch the crow.

## Verification (whole project)
- `npm run build` clean; `npm run preview` and walk every trigger in the egg table.
- Calendar: subscribe to the deployed `/calendar.ics` in Google Calendar.
- CMS: log in via the Worker, edit an event, confirm the commit and the rebuild.
- Rollback dry run: disable everything in `src/chaos/registry.ts`, and the site is a clean, plain SBR site.
