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
  Fixed small source typos (missing spaces, split "Port & Sherry" bold). Favicons (`public/favicon.ico`,
  `favicon-32.png`, `apple-touch-icon.png`) come from `scripts/arms/favicon.sh`: the crest eagle's head on a Johns
  red rounded square (the full arms is unreadable at 16-32px), and both layouts link them through `url()` so the
  base path is applied.

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

## Phase 8 - Gag: animated logo  `[x]`
- Reassemble arms parts in an inline SVG; CSS/WAAPI animations: yale head-bob + tongue flick, horn swivel (independent,
  per heraldic lore), tail swish, eagle occasional wing flap. All of them; user trims later. Fallback: static logo.
- Notes: `AnimatedArms.astro` (hero only; footer keeps the PNG) places each part as an `<image>` in one SVG, since the
  part files reuse `cls-N` class names with different styles and would clash if inlined. Each part sits in a
  `<g data-part>` with `transform-box: view-box` and its pivot as `transform-origin`. Each yale's ear, horns, tongue,
  tail and body share a `<side>-yale-group` for the head-bob (pivot at the feet, so the whole yale sways; the head is
  not a separate part). Legs stay static behind the shield. `gags/animated-logo.ts` runs one random-interval WAAPI
  loop per motion (horns each on their own timer), pauses via the bus, and slows 3x under reduced motion. With the
  gag disabled the SVG is the static logo. Wings flap downward from the raised rest pose.

## Phase 9 - Gag: Soleh-bot AI assistant  `[x]`
- Floating chat bubble with Soleh's cutout face. Never helpful.
- `src/content/jokes/assistant.yaml`: ~20 intents (events, welfare, food, formal, rent, PhD, thesis, porters, wifi,
  greeting, help, who-are-you, Samuel Butler, sheep, ...) each with example phrases and 5+ replies, plus fallbacks.
- Matchers behind `assistantMatcher: 'keyword' | 'embedding'` config: keyword/regex (default, instant), and
  Transformers.js `Xenova/all-MiniLM-L6-v2` lazy-loaded on first message, cosine against precomputed intent example
  embeddings (computed in browser on load, cached). Typing indicator, sometimes "thinks" for too long.
- Real info: occasionally gives a real fact wrapped in nonsense (BA Table days, Port & Sherry price).
- Notes: the bot is named Solbee (`name` in `assistant.yaml`). `src/chaos/gags/assistant/{index.ts,match.ts}`. Data reaches the client through
  `src/components/AssistantData.astro` (in `BaseLayout`, so not on game pages): it validates `assistant.yaml` with a zod
  schema (a bad edit fails the build) and adds Soleh's cutout as a 128px webp, as `<script id="assistant-data">` JSON.
  `assistant.yaml` has `greeting`, `thinking`, `nudges`, `fallbacks`, `facts` and 23 `intents` (`keywords`, `examples`,
  `replies`). It is edited in git: the CMS jokes form (`title` + `lines`) does not fit its structure. Quote numbers and
  lines containing ": " in it, or YAML parses them as numbers/maps. `config.assistantMatcher` in `registry.ts`
  picks the matcher. Keyword: keywords of 5+ characters match word prefixes, shorter ones whole words; most hits wins.
  Embedding: `@huggingface/transformers` 4.3.0 (dynamic import, separate ~540KB chunk) loads
  `Xenova/all-MiniLM-L6-v2` from the Hugging Face hub on the first message, embeds all examples once, best cosine above
  0.35 wins, and it falls back to keywords if loading fails. Replies wait 0.6-2.5s, 1 in 7 "think" for 8-15s with
  `thinking` lines, 1 in 5 append a `facts` line. One nudge popup 30-60s after load, timer stopped while paused.
  Verified in headless Chromium at 375/1280px (keyword replies, Esc/X, no horizontal scroll, nudge, absent on game pages,
  gag disabled leaves no widget) and embedding mode (first reply about 5s, paraphrases matched the right intents).

## Phase 10 - Gag: "Are you a robot"  `[x]`
- Any form submit / issue-form link / CMS-ish button first shows a fake reCAPTCHA. Ticking it -> "Wrong! Robot detected,
  alerting the porters!" with a porter siren animation, then lets you through after a beat.
- Also: a "select all images with a fox" grid where a selected fox slowly morphs into a cat. Never passes; a "Give up"
  button appears after a few tries.
- Notes: `src/chaos/gags/captcha/{index.ts,tiles.ts}`, copy in `src/content/jokes/captcha.yaml` (validated and
  passed to the client by `CaptchaData.astro` in `BaseLayout`, same pattern as Solbee). Flow: checkbox (spinner) ->
  3x3 grid of flat inline SVG tiles with 2-4 foxes -> every Verify fails with a random line and reshuffles -> after 3
  fails "Give up" -> red/blue flashing siren panel (`sfx.siren()`, real Porters' Lodge number) -> action proceeds.
  Esc or backdrop click cancels. Intercepted (capture phase): clicks and middle clicks on links to Google Forms,
  `forms.gle`, `/issues/new`, `/admin`, or `[data-captcha]`, and every form submit except Solbee's. Same-tab links
  navigate automatically; new-tab links (target `_blank`, modifier or middle click) get a Continue link so popup
  blockers allow them; forms resubmit via `requestSubmit` with a one-shot bypass. Nothing is intercepted while a game
  overlay is open. Fox tiles keep a cat drawing underneath: fur colour, ear scale and a fox/cat crossfade transition
  over 3s once selected. Added a real "Suggest an event" link (GitHub issue form) to `SubscribeButtons`. `client.ts`
  now registers the game-trigger click listener in the capture phase before gags init, so game triggers win over gag
  handlers. Verified in headless Chromium at 375/1280px (welfare form and issue links open it, Esc cancels, morph,
  give-up after 3, siren, Continue href, form resubmits, Solbee unaffected, no horizontal scroll, no page errors).

## Phase 11 - Gag: pong edges  `[x]`
- Cursor within ~20px of a viewport edge spawns a ball (fixed-position canvas overlay, pointer-events none except
  paddles). Player paddle on the nearest edge, AI paddle with a random game-roster face on the opposite edge.
  Missed ball smashes a random visible element (shake + crack). Score in corner. No-op on touch.
- Notes: `src/chaos/gags/pong.ts`, copy in `src/content/jokes/pong.yaml` (`you`, `taunts`, `excuses`, `smashes`;
  validated by `PongData.astro`). `RosterData.astro` (in `BaseLayout`) emits the game roster as `#roster-data`
  JSON (`name`, `role`, `face`, `cutout`) for client gags; Phase 12 can reuse it. The canvas is fully
  `pointer-events: none`: the player paddle follows the cursor via a document `mousemove` listener, so the page stays
  clickable during a rally. The player edge is fixed per rally; each rally picks a new roster face. The AI chases the
  ball at a capped speed with a random aim error, re-rolled on every player hit, and the ball speeds up 8% per hit.
  On a miss the ball flies into a random visible block element (skipping chaos UI and fixed/sticky containers), which
  shakes and gets a page-positioned SVG crack with a `smashes` label (max 25, oldest removed); the AI says a
  taunt/excuse in a bubble. 1s cooldown between rallies, no rally while paused or the captcha is open, speeds halved
  under reduced motion. Score box bottom-left. Verified in headless Chromium at 1280px (all four edges, misses,
  cracks, score, bubble, clicks pass through, rally with a still paddle lasted ~14s, no horizontal scroll, no page
  errors) and iPhone emulation (no canvas). Pause/resume was not exercised: no game is registered yet to open the
  overlay.
  Follow-up: the AI paddle (and its face disc) is gold when it sits on the top edge, since red clashes with the
  header. Cracks are at z `2147482500`, above the ragdoll canvas, the pong canvas and Solbee, below the overlay and
  captcha.

## Phase 12 - Gag: 3-minute ragdoll  `[x]`
- After 180s on any page (and every 180s after), a Matter.js ragdoll with a random roster face drops from the top
  into a full-viewport overlay world, lands on the viewport bottom, can be grabbed and flung. Cap count (~5).
- Notes: `src/chaos/gags/ragdoll.ts`, copy in `src/content/jokes/ragdoll.yaml` (`arrivals`, `grabbed`, `flung`;
  validated by `RagdollData.astro`), faces from `#roster-data`. A 1s interval counts seconds only while not paused and
  the tab is visible; every 180 drops a doll. matter-js loads (via `startMatter`, no renderer) on the first drop. World:
  floor at the viewport bottom, tall side walls, no ceiling; rebuilt on resize. Doll = head circle, torso, upper/lower
  arms and legs joined by length-0 constraints, one collision group per doll. Red blazer, blue trousers, face image on
  the head with a gold ring, drawn on one `pointer-events: none` canvas. Grab: capture-phase `pointerdown` hit-tests the
  dolls (`Query.point`) and drags with a constraint; release keeps the velocity (clamped to avoid tunneling). The click
  after a drag is swallowed in window capture, so links under a doll do not fire. Non-passive `touchstart` blocks
  scrolling only on a doll hit. Hover shows a grab cursor. Speech bubble follows the head: an `arrivals` line on first
  landing, `grabbed` 1 in 3, `flung` 1 in 2 on a fast release. Cap 5 (oldest removed). Pause stops the runner and
  draw loop. Reduced motion halves `timeScale`. Verified in headless Chromium at 1280px and iPhone emulation with a
  sped-up interval (drop, landing, bubble, grab cursor, drag and fling, link click unaffected, pile, no horizontal
  scroll, no page errors). Pause/resume not exercised: still no game registered.

## Phase 13 - Gag: gravity collapse  `[x]`
- Reaching the bottom of the page converts visible elements (leaf-ish blocks: headings, paragraphs, cards, images,
  nav items) into Matter bodies (absolute-positioned clones, originals hidden) that fall and pile up. Stays fallen,
  draggable (Google Gravity style). Reload restores.
- Notes: `src/chaos/gags/gravity.ts`, no copy file. Triggers on a scroll that arrives at the page bottom (edge
  triggered; scroll in the first 1s is ignored so restored scroll on reload does not collapse; non-scrolling pages
  never trigger). Each arrival collapses any not-yet-fallen visible blocks (cap 160). Blocks: DOM walk from `body`
  taking the outermost element in the viewport that matches an atom selector (headings, p, li, img, svg, figure,
  button, `.card`, ...) or has only inline children, fits in the viewport, and has no iframe (Instagram embeds stay);
  fixed elements and chaos UI are skipped, the sticky header's items fall. Clones get computed styles inlined
  recursively (not inside SVGs), ids removed, and live in one page-sized absolute `.gv-layer`; originals get
  `.gv-gone` (visibility hidden, layout kept). Inline-only blocks shrink to their text width so full-width headings
  fall as tight cards; transparent blocks get the nearest ancestor background plus a light shadow. World is in page
  coordinates: floor at the document bottom, side walls at the page width, rebuilt on resize (blocks pushed back
  inside). Sleeping enabled, speeds clamped, `boom` on collapse and throttled hard impacts. Drag via a constraint
  from capture-phase `pointerdown` on a clone; the click is swallowed only if the pointer moved over 6px, so fallen
  links still work. Clones use `touch-action: pan-y` so the pile never traps scrolling on touch. Pause stops the
  runner and draw loop; reduced motion halves `timeScale`. Pong skips `.gv-layer`/`.gv-gone`. Verified in headless
  Chromium at 1280px and 390px mobile emulation on home, history, quick-links, freshers and an event page (collapse,
  pile, drag and fling, fallen link click navigates, resize, reload at bottom does not collapse, no horizontal
  scroll, no page errors). Pause/resume not exercised: still no game registered.

## Phase 14 - OSM extract pipeline  `[x]`
- `scripts/osm/fetch.mjs`: Overpass query for a bbox around St John's (roughly Magdalene Bridge to Trinity St to the
  Backs; include All Saints Passage and Fisher Building), buildings (with `height`/`building:levels`), landuse/leisure
  grass, water (Cam), highways, named POIs. Save `src/data/osm.geojson` + local metric projection helper.
- `scripts/osm/tilemap.mjs`: rasterize to a ~1 tile = 4m grid -> `src/data/tilemap.json`
  (wall/grass/tallgrass/water/path/road/door + names).
- Checklist: rendered debug PNG of tilemap is recognizable as St John's.
- Notes: no new deps. `fetch.mjs` POSTs one Overpass query (overpass-api.de, kumi mirror fallback; `--cached` reuses
  `scripts/osm/out/raw.json`) for bbox S,W,N,E `52.2042, 0.1042, 52.2134, 0.1212` (covers the rotated tilemap crop: Grange Road and the
  playing fields to All Saints Passage, Trinity Great Court to Northampton Street; 180 s server timeout, third mirror
  overpass.private.coffee) and converts it itself: nodes to Points, closed area ways to Polygons, multipolygon relations
  stitched into (Multi)Polygons. Kept tags are whitelisted, plus `osm_id` and `height_m` (height, else levels x 3.2,
  else 10; OSM has no heights here, so everything is 10). Top level carries `bbox`, `origin` (bbox centre),
  `attribution`, `fetched`. One feature per line (prettier-ignored). Projection is `src/chaos/shared/geo.ts`
  (`makeProjection(origin)`: x metres east, y metres south), imported by the scripts via Node's type stripping.
  `tilemap.mjs` projects around a fixed `ORIGIN`, rotates 61 degrees clockwise (west up, north right like the college
  map image; St John's courts end up square to the grid) and crops to `CROP` in rotated metres, giving 145x243 tiles
  at 4 m. Default tile is `path` (paved courts); paint order grass (grass, garden, park, pitch, recreation ground) ->
  pitch (`leisure=pitch`) -> tallgrass (wood, scrub, meadow, flowerbed) -> water (polygons + widened waterway lines)
  -> road -> path lines and bridges -> wall (buildings except `roof`) -> footways (not indoor or underground) and
  `tunnel`/`covered` roads carved back through walls with a 4-connected stroke, plus footway loose ends under 2.5
  tiles apart joined (screens passages and gate arches are often unmapped) -> trees (`natural=tree` points,
  `tree_row` every 2 tiles, and about 1 in 4 wood tiles away from paths; only ever on grass/tallgrass/pitch) -> door
  (each `entrance` node snapped to the nearest wall tile bordering open ground; doors with open ground on opposite
  sides become path, since they are passages through thin walls).
  `tilemap.json`: `origin`, `rotation`, `crop`, `legend` (`.` path, `,` grass, `;` tallgrass, `~` water, `=` road,
  `#` wall, `D` door, `T` tree, `P` pitch), `rows`
  (one string per row), `names` ({name, kind, x, y} for buildings, courts, greens, bridges, POIs; streets and water
  once each at the longest way's midpoint). Duplicate names exist across colleges (e.g. two "First Court"s).
  Debug PNG at `scripts/osm/out/tilemap.png` (gitignored): playing fields top left, Cam across the middle, St John's
  courts and Great Gate side lower right, all read clearly.

## Game phases
Each game phase: build `src/games/<slug>/`, register in the registry with its trigger, data/jokes in `data.json`,
keep graphics simple (shapes + faces), include the listed real info. Checklist for every game: opens from trigger,
playable for 30s without errors, closes cleanly, standalone URL works, touch behaviour as specified.

### Phase 15 - Flappy Eagle  `[x]`  trigger: logo eagle | touch: yes
- Gold crest eagle from arms parts, real wings flap on input, chained crown jangles. Obstacles: St John's chapel tower /
  Gatehouse pinnacles. Score milestones show SBR facts (founded 1960, etc).
- Notes: `src/games/flappy-eagle/{index.ts,data.json}`, registered as `flappy-eagle`. Triggers: the existing
  `data-game` on the hero `.logo` (whole logo) plus the registry selector `.arms-anim [data-part^="eagle-"]`. Kaplay,
  immediate-mode drawing in one `onDraw` (no game objects). The eagle is `eagle-wing-l`, `eagle-wing-r` and
  `eagle-body` loaded as sprites from the arms parts (`?url`) and placed with `arms-parts.json` coordinates, mirrored
  to face right; wings rotate about their pivots for a 0.25s downstroke per flap. The crown and chain are baked into
  `eagle-body`, so the "jangle" is a decaying wobble of the body about the neck plus two high chinks. Obstacles: a
  "Cambridge drizzle" raincloud column from the top, and below the gap either the Chapel tower (stone, four pinnacles,
  lancet windows) or the Great Gate (brick, turrets, arms panel, arch). Ground is "The Backs" with the Cam. Everything
  scales with viewport height; the gap shrinks from 0.31H to 0.25H with score. Circle hitbox (forgiving), the ceiling
  clamps, the ground kills. Facts at scores in `milestones` (then every 10) in a red/gold banner with a fanfare; death
  shows a random `deaths` line, score and best (localStorage, try/catch). Restart 0.7s after death. Reduced motion
  runs at 0.7x. `pixelDensity: devicePixelRatio` keeps it crisp on phones. Verified in headless Chromium: standalone
  at 1280px, overlay opened from the logo, Esc and X close it, iPhone emulation taps, and a temporary autopilot hook
  (removed) scored 10 and showed the first fact banner, with no page errors.

### Phase 16 - Star Wars crawl  `[x]`  trigger: Freshers' Guide link | touch: tap to speed
- Full `guide.md` as a perspective crawl, "Episode N: <section>" per section, starfield, arrow keys/scroll speed
  control, section skip. Opening "A long time ago in a college far, far away...".
- Notes: `src/games/crawl/{index.ts,markdown.ts,data.json}`, registered as `crawl` with no extra selector (the
  existing `data-game="crawl"` hooks on the landing Freshers' Guide heading and the `/freshers` "Watch the crawl"
  button launch it). DOM + CSS 3D, no Kaplay: `guide.md?raw` is split on `##` into 7 episodes, each rendered by
  `markdown.ts` (headings, paragraphs, lists, `- [ ]` checklists, pipe tables, bold, italic, links as text only,
  `<br>`; DOM built without innerHTML). Each episode header is "Episode N: <chapter>" plus a joke title from
  `data.json` `episodes`; an `end` card follows the last one. The text plane is `rotateX(25deg)` with perspective
  0.6x the stage height, moved by `translateY` in a rAF loop, top faded with a mask. Sequence: blue opening line
  (0-4.5s), outlined "FRESHERS' GUIDE" logo shrinking away with a fanfare (4.5-11s), crawl starting at 8s, loop back
  to the opening after the end card leaves the top. Static canvas starfield. Controls: Up/Down and wheel change the
  speed multiplier (-4 to 12, rewind stops at the start), Right/PageDown/N next episode, Left/PageUp/P back to the
  start of this episode then the previous one, Space pause, any key/tap/wheel skips the intro; tap gives a decaying
  speed burst, hold (over 0.25s) fast-forwards 6x; a controls hint at the bottom and a corner label with episode and
  speed. Registry `autoOpen: '/freshers'` opens it on page load there (`client.ts`), and `closeLabel: 'Boring mode'`
  replaces the X in the overlay and on the standalone page; closing it leaves the plain guide. Base speed 2 em/s (x0.7 under reduced motion).
  Verified in headless Chromium: standalone at 1280px (opening, logo, crawl, speed, skip, pause, end loop) and
  iPhone emulation (tap skip and tap speed-up, no horizontal scroll), opened from `/` and `/freshers`, Esc and X
  close, no raw markdown in the output, no page errors.

### Phase 17 - Pokemon map  `[x]`  trigger: college map image | touch: on-screen d-pad (simple)
- Top-down tile game from `tilemap.json`. Tall grass -> random encounters (Wild Porter, Tourist, Goose, Punt tout,
  Supervisor) with a joke battle menu. Committee NPCs at hand-placed spots in `npcs.json` (e.g. Treasurer at the Buttery,
  Welfare at the GSR, President in the SBR at I2 First Court), dialogue from their real bios. A glowing "portal" block
  launches Minecraft.
- Notes: `src/games/pokemon/{index.ts,world.ts,battle.ts,data.json,npcs.json}`, registered as `pokemon` ("Pocket
  Johnians") with no extra selector (the existing `data-game` on the college map image launches it). Kaplay,
  immediate-mode drawing like Flappy Eagle. `world.ts` reads `tilemap.json`: walls, doors, trees and water block,
  everything else is walkable (buildings cannot be entered); `fromLonLat()` maps a coordinate into the rotated tile
  frame; `snap()` moves hand-placed coords to the nearest
  walkable tile; `nearestArea()` (buildings, courts, greens, bridges, streets within 7 tiles, no shops) drives a
  Pokemon-style area banner. Grid movement (0.16s per tile, x0.7 speed under reduced motion), a short tap only turns,
  camera centred on the player, tile size `min(H/15, W/9)`. Start in St John's First Court by the SBR. Doors draw as plain wall. Trees are
  a trunk and round canopy drawn in the y-sorted sprite pass so they overlap the tile above; pitches are striped grass
  with white touchlines. On-map labels (cream pills, overlap-skipped, never over the player): courts, greens, bridges,
  water and streets from `tilemap.json` names, a building allowlist `labelBuildings` with short names, `labelExtra`
  (Great Gate, Hall, SBR, GSR by lon/lat) and `labelRename`, all in `data.json`. Encounters:
  tall grass is 1 in 9 per step (any foe), and since the nearest tall grass is ~86 steps from the start, lawns also
  roll 1 in 20 for a Porter ("keep off the grass"); a few grace steps at start and after each battle. Battle: FIGHT
  (4 joke moves), BAG, SBR (heals), RUN (fails 1 in 3), typewriter text, HP bars, simple shape sprites per foe, each info box placed beside its own sprite (enemy box left of the
  foe, player box right of the player, falling back to above the sprite when there is no room); win,
  lose (wake up back at the SBR) or flee each end on a real fact. NPCs: 9 roster members placed in `npcs.json` by lon/lat (as are `start` and `portal`)
  (President in First Court, Treasurer at the Buttery, Welfare at the GSR, Secretary by the Chapel, Co-VPs at the
  Third Court end of the Bridge of Sighs (beside the 1-tile path, not on it) and Kitchen Bridge, Academic by the Library, Environment on the Backs, Comms at the Forecourt);
  A while facing one shows their face, name and role, their bio paged by sentence, then a joke line; a "Committee
  met" counter, fanfare when all 9 are found. `RosterData.astro` takes `full` (adds `slug` and `bio`) and
  `GameLayout` renders `<RosterData full />`, so every game page has `#roster-data` with bios. Portal next to the
  President: if `games.minecraft` is registered it navigates to `/games/minecraft` keeping `?embed=1` (the overlay
  iframe switches game), otherwise a "still loading" message. Controls: arrows/WASD, Space/Enter/Z = A, X/Backspace
  = B, clicks advance text and pick battle options. On `(pointer: coarse)` an HTML d-pad + A/B is added (hidden in
  battles, where options are tapped directly) and dialogue moves to the top of the screen. Kaplay's text atlas
  leaves faint marks under spaces on dark backgrounds, so both text boxes are cream. Verified in headless Chromium:
  standalone at 1280px (intro, walking, Soleh's bio pages, portal message, lawn encounter, FIGHT/moves/BAG/SBR/RUN,
  win back to the map, 20s random walking), opened from the map image on `/` with Esc and X closing it, iPhone
  emulation (pad walking, A, no horizontal scroll), no page errors. Tall-grass encounters were not walked to in the
  test (same code path as lawns).

### Phase 18 - Minecraft  `[x]`  trigger: portal in Pokemon + "TV with a Wii" text in the SBR room description | touch: desktop-only
- three.js voxel world from `osm.geojson` (~200x200 blocks; buildings as stone columns at height, grass, water, paths),
  greedy-meshed chunks, pointer-lock first-person, break/place blocks. Mobs: many creepers that chase and blow
  craters (very destructive, chain reactions), zombies with roster faces. Signs with real building names.
- Notes: `src/games/minecraft/{index.ts,world.ts,body.ts,mobs.ts,data.json}`, registered as `minecraft` ("Johncraft",
  `touch: false`) with no extra selector: the existing rehype hook already wraps "TV with a Wii" in the SBR room text,
  and the Pokemon portal navigates to it. New deps `three` (+ `@types/three` dev), added to `optimizeDeps`. The
  rasterizer moved from `tilemap.mjs` into `scripts/osm/raster.mjs` (`rasterize({tile, origin, rotateDeg, crop})`,
  widths now in metres; `tilemap.json` output byte-identical) and also returns per-tile building heights.
  `scripts/osm/voxels.mjs` runs it at 2 m over the same rotated frame, cropped to x -120..280, y -100..300 (200x200:
  New Court and the Backs to All Saints Passage, Trinity to Magdalene Bridge) -> `src/data/voxels.json` (`rows` as
  in tilemap, `heights` one base-36 char per tile in blocks at 1.5 m per block, so every 10 m building is 7 blocks,
  `names`, `spawn` = the Pokemon start outside the SBR) + `scripts/osm/out/voxels.png`. `tilemap.json` and
  `voxels.json` are prettier-ignored (generated). World: 200x48x200, bedrock, dirt, surface at y 4; water sunk to
  y 2-3; buildings solid stone with a roof layer and wooden door blocks at entrances; OSM trees plus extra trees on
  open lawns and bushes in tall grass. 16x16 chunk columns, greedy-meshed with vertex colours (Lambert, hemisphere +
  sun, fog), water in a separate transparent mesh, up to 6 dirty chunks remeshed per frame. AABB physics per axis
  in sub-steps (shared by player and mobs), outside the map is a wall. Sprite signs for every building, court,
  bridge, street, green and water name (deduped), plus an SBR sign ("TV with a Wii, pool table...") in front of the
  spawn view; HUD shows the nearest name. Controls: WASD, Shift sprint, Space jump/swim, mouse look, left click
  break/hit/light TNT, right click place, 1-6/wheel hotbar (planks, stone, dirt, grass, leaves, TNT). Bedrock is
  unbreakable. Mobs: 32 creepers kept topped up (spawned 20-60 blocks away, roofs included), chase within 26, light
  at 2.4 (1.5 s fuse, flash and swell, defuse beyond 7 unless chain-lit); blast radius 4 removes a rough sphere,
  flings and hurts everything within 8, lights nearby creepers and TNT on short fuses (chain reactions). One zombie
  per roster member (black gown, face crop greened on the head front, name and role tag), 2 damage per hit with
  knockback, 4 hits to kill, respawn after 15 s; generic zombies if the roster is empty. Real info: death screen and
  pause screen show a fact from `data.json`, zombie lines ("Zombie <name> (<role>) has resigned..."), and a running
  "Damage to listed buildings: GBP" bill (GBP4,500 per stone/roof/door block) with porter notes at 1, 4, 16... x the
  first block's cost, at most one per 4 s. 20 HP, regen after 5 s unhurt, fall damage, death -> click to respawn at
  the SBR (clears mobs within 14). Pause: Esc releases the mouse and pauses (the game swallows that Esc and calls
  `exitPointerLock`), a second Esc closes via `GameLayout`. If pointer lock is refused it falls back to drag-to-look.
  Reduced motion: mobs and particles x0.7, smaller shake. The game chunk is ~650 kB (three + voxel data), lazy-loaded.
  Verified in headless Chromium (SwiftShader): standalone at 1280px (menu, pointer lock, walking, break/place,
  explosion crater and porter notes, 30 s with mobs chasing until a zombie killed the player, death screen), a
  roster-faced zombie close up, overview from above with building signs, opened from "TV with a Wii" on `/` with
  first Esc pausing and second Esc closing the overlay, `?embed=1` URL as used by the portal, iPhone emulation shows
  the desktop-only notice, no page errors. A temporary debug hook used for the checks was removed.

### Phase 19 - Flight sim  `[x]`  trigger: address / CB2 1TP | touch: desktop-only
- three.js: OSM buildings extruded by height over a flat ground with OSM-colored landuse and the Cam. Simple arcade
  plane physics (pitch/roll/throttle). Labeled floating markers for SBR, GSR, Chapel, Bridge of Sighs. Attribution: OSM.
- Notes: `src/games/flight-sim/{index.ts,world.ts,plane.ts,data.json}`, registered as `flight-sim` ("Johnian Flight
  Simulator", `touch: false`) with no extra selector (the footer `<address data-game>` and the "CB2 1TP" phrase hook
  already launch it). `scripts/osm/flight.mjs` turns `osm.geojson` into `src/data/flight.json` (~325 kB,
  prettier-ignored): local metres around the extract origin (x east, z south, no rotation), 0.5 m rounding,
  `buildings` (rings with holes, height, class stone/brick/shop), `areas` (town, court, grass, pitch, wood, water),
  `ribbons` (roads, paths, waterways with widths), `markers` and `start`. Heights: OSM `height`, else levels x 3.2 +
  1.5, else a per-type default with a deterministic jitter, plus name overrides; the Chapel is 24 m with a 13 m
  square, 50 m tower added at its centroid aligned to its longest edge. World: ground plane (polygon offset) with the
  layers drawn on top without depth writes in a fixed render order; buildings extruded and merged into one
  vertex-coloured mesh (roofs darker). Collision: spatial grid of building polygons (body and nose point below the
  roof = crash) and water (areas plus river ribbons). Plane: box model in red/gold/blue with a random roster face
  as the pilot; arcade physics with throttle, pitch (Up = nose down), roll with auto-level, rudder, bank-induced
  turn, stall below 17 m/s (sinks, nose drops), ceiling at 380 m. Landing works on any ground (sink under 8 m/s,
  bank under 25 degrees, nose not steeply down); taxi and take off again. Water touchdown, hard landings and
  buildings crash (fireball, debris, `boom`, crash line + real fact). Past 250 m off the extract the plane banks
  itself back. Five gold rings (SBR, GSR, Chapel, Bridge of Sighs, Great Gate) over beams with name labels, stacked
  when close; flying through one shows its real fact with a fanfare. HUD: speed (kt), altitude, throttle, arrow and
  distance to the nearest unvisited ring, counter, OSM attribution. Chase camera or cockpit (C), P or blur pauses,
  Esc is left to `GameLayout`. Reduced motion runs at 0.7x with less shake. Verified in headless Chromium
  (SwiftShader): standalone at 1280px (menu, flying, banking, cockpit, diving into a building, restart, climb), all
  five rings, landing on the playing fields, taxi and take-off, ditching in the Cam, opened from the footer address
  on `/` with Esc closing it, iPhone emulation shows the desktop-only notice, no page errors. A temporary debug hook
  used for the checks was removed.

### Phase 20 - Breakout: Bridge of Sighs  `[x]`  trigger: Sports officer / punt mention | touch: drag
- Bricks form the Bridge of Sighs outline (1831, Henry Hutchinson) over the Cam. Paddle is a punt with a pole-wielding
  student. Facts pop on brick break.
- Notes: `src/games/breakout/{index.ts,data.json}`, registered as `breakout` ("Breakout: Bridge of Sighs") with no
  extra selector: the Sports card in `Committee.astro` already carries `data-game="breakout"`, and a new phrase hook
  wraps "College punts" in the Freshers' Guide Punting paragraph on `/freshers` ("sinking passing punts" in the history
  stays with `bumps`). Kaplay, immediate-mode drawing like Flappy Eagle. The bridge is the `bridge` ASCII grid in
  `data.json` (29x14: pinnacles, crenellations, parapet, a row of five gothic windows, a gold arms panel, the arch
  underside down to both banks): `#` stone (1 hit), `w` glass (2 hits, cracks), `g` gold (always shows a fact).
  Bricks fill the width and at most the top 46% of the height. Facts (bridge, punting from `guide.md`, SBR basics)
  show in a red/gold banner on gold bricks and every `factEvery` (6) breaks. The punt sits on the Cam with a gowned
  student in an LMBC red scarf at the stern (random roster face as the head, plain head without a roster) whose
  pole leans against the punt's motion; bounce angle from the hit position (up to 60 degrees). Gold ball,
  sub-stepped at half a radius so it cannot tunnel. 3 balls; into the Cam = splash, `boom` and a splash line;
  game over line, score and best (localStorage `breakout-best`, try/catch), restart after 0.7s. Clearing the
  bridge rebuilds it with the ball 12% faster per level. Controls: mouse move or touch drag sets the punt x,
  Left/Right/A/D, Space/Up/W/Enter or click/tap launches. Reduced motion runs at 0.7x. Verified in headless
  Chromium: standalone at 1280px (launch, 30s of play with an autopilot, fact banner, losing all balls, game over),
  opened from the Sports card on `/` and from "College punts" on `/freshers`, Esc closes the overlay, iPhone
  emulation (tap launch, drag moves the punt, no horizontal scroll), no page errors. A temporary debug hook used
  for the checks was removed.

### Phase 21 - Crossy Road  `[x]`  trigger: GSR / All Saints Passage | touch: tap/swipe
- Lanes named after real streets between the GSR and First Court (All Saints Passage, St John's St, Bridge St).
  Traffic: bikes (fast, swarming), delivery scooters, double-decker buses. Goal: reach the SBR.
- Notes: `src/games/crossy-road/{index.ts,data.json}`, registered as `crossy-road` ("Crossy Road: GSR to SBR") with
  no extra selector (the GSR heading `data-game` and the "All Saints Passage" phrase hook already launch it). Kaplay,
  immediate-mode drawing like Breakout. Top-down 11-column grid, tile `min(W/11, H/9)`, centred with the area outside
  the columns dimmed; the camera follows the player up a fixed 21-row `course` in `data.json` (bottom to top): the GSR
  door at 1 All Saints Passage, pavements with bollards, All Saints Garden market stalls, tourists and bins as
  blocking props (`tiles` strings, `#` blocks), red cycle lanes and roads on All Saints Passage, Trinity Street,
  St John's Street and Bridge Street, the Great Gate (brick wall with a 3-tile opening and turrets), First Court
  (path, then lawn `g` with paths at both edges) and the I staircase door `D` at the far left ("turn left"). Traffic
  per lane: `kind` (bikes in swarms of 1-4, delivery scooters with coloured boxes, double-deckers numbered 1, 3 and
  U), direction, speed in tiles/s and gap range; lanes are pre-simulated 30s so the streets start full. Hop 0.12s
  with one queued move, collision on the lane the player is nearest during the hop. Deaths: bike/scooter/bus
  (flattened), lawn (a Porter appears), and the crest eagle: after 6s without forward progress a shadow circles
  with a warning banner, at 9s the gold eagle swoops and carries you off. Reaching `D` is a trip: fanfare, win line,
  +10 x trip, then back to the GSR with traffic 15% faster per trip. Score is rows gained plus trip bonuses, best in
  localStorage `crossy-road-best` (try/catch). Facts (GSR, cycling rules, buses, SBR location, Porters' Lodge) show
  in a red/gold banner on each new pavement/gate row and on arrival. Controls: arrows/WASD, Space/Enter/click/tap
  hop forward, swipe hops in its direction, any input restarts after death (0.7s). Reduced motion runs at 0.7x.
  Verified in headless Chromium: standalone at 1280px (traffic deaths, a full trip to the SBR and the next trip, the
  lawn Porter, the eagle warning and swoop, restart), opened from the GSR heading on `/` with Esc closing it, iPhone
  emulation (tap hops, swipe right, no horizontal scroll), no page errors. A temporary invincibility hook used for
  the checks was removed.

### Phase 22 - Jack's Gelato stand  `[x]`  trigger: Buttery/Cafe quick link | touch: yes
- Lemonade-stand loop: each day set price per scoop + number of tubs + flavour picks (weird rotating flavours).
  Random Cambridge weather, tourist coachloads, queue down Bene't St. Daily report. Real info: SBR is in First Court,
  Buttery hours link.
- Notes: `src/games/gelato/{index.ts,data.json}`, registered as `gelato` ("Jack's Gelato Stand") with no extra
  selector: `QuickLink.astro` already sets `data-game="gelato"` on quick links whose label matches /buttery/i (the
  Buttery/Bar/Cafe Hours and Menu links). DOM panels over one plain 2D canvas, no Kaplay (the game is mostly menus,
  and DOM buttons give touch for free). 7 days, start GBP 200. Plan panel: weekday, forecast (right 60% of the
  time), the day's event, cash, price per scoop (-/+ GBP 0.25, 1 to 12), tubs (GBP 30 for 30 scoops, capped by
  cash), 6 random flavours from 24 in `data.json` with hidden appeal (pick 1-3). Day: 18s for 11:00-23:00, tap,
  click, Space or Enter toggles x4. Arrivals = 140 x weather demand x event demand x jitter, peaking mid-afternoon;
  tourist share by event. Each customer rates the offered flavours (appeal x random) and wants the best; willingness
  (students 2.5-6, tourists 4-9) x weather pay x that rating. They walk off at the price, at the queue (patience
  8-30, tourists +10), or when sold out, else join the queue; the counter serves at most 170 a day while stock
  lasts. Sold out disperses the queue with a SOLD OUT sign; closing time sends the rest home. Canvas: weather sky
  (sun, drifting clouds, rain), Corpus wall with "Bene't Street" left, The Eagle right, Jack's in the middle as a
  cutaway (door on the left, counter with tubs and Jack on the right, price board on the back wall, striped awning).
  Two pavement lanes: everyone walks along the front lane from either side; buyers step back into the queue, which
  runs from the counter out the door to the left; decliners stop in front of the shop, complain, and walk on; served
  customers step out and carry on their way. A "Heathrow day trips" coach on coachload days; people are simple shapes with umbrellas in
  rain, bucket hats for tourists, ~12% roster faces with their own lines, cones after serving; speech bubbles are
  skipped when they would overlap another. Report: takings, tubs, GBP 60 pitch fee, profit, cash, walk-off counts,
  bestseller and "Nobody wanted", a joke line, a real fact (SBR in I2 First Court, Port & Sherry, BA Table, GSR,
  founding, the room) and a Buttery hours link (the real quick link URL, new tab). Leftover stock halves overnight.
  End after day 7, when cash goes negative, or when there is no stock and no money for a tub ("Repossessed"); best
  week in localStorage `gelato-best` (try/catch). Reduced motion runs the day at 0.7x. Verified in headless
  Chromium: standalone at 1280px (full week with normal, fast-forward, sold-out and overpriced days, bankruptcy,
  restart), opened from both Buttery quick links on `/` with Esc closing the overlay, iPhone emulation (flavour and
  button taps, tap to speed up, report, no horizontal scroll), no page errors.

### Phase 23 - QWOP to St John's  `[x]`  trigger: Accommodation / station | touch: desktop-only
- Matter.js ragdoll runner, Q/W/O/P control thighs/calves. Cartoon Johnian: LMBC red blazer, scarf. Distance markers
  along the real route Station Rd -> Hills Rd -> Regent St -> St Andrew's St -> Sidney St -> Bridge St -> St John's.
- Notes: `src/games/qwop/{index.ts,body.ts,data.json}`, registered as `qwop` ("QWOP to St John's", `touch: false`)
  with no extra selector: the Accommodation heading already carries `data-game="qwop"`, and a new phrase hook wraps
  "walk from the station" in the Freshers' Guide travel paragraph on `/freshers` ("train station" there is a link, so
  it cannot be hooked). `body.ts` is the Matter.js ragdoll in centimetres (ground top at y 0): torso, head, thighs,
  calves, feet, upper and lower arms, pinned with zero-length constraints in one negative collision group, built
  in a slight A-frame so it stands with nothing pressed. Joint motors trade angular velocity between the two bodies
  of a joint (keeps angular momentum, stable at the strengths needed; torque PD exploded or sagged), aiming for a
  relative speed of 0.5x the angle error, plus a firm push back past each joint's limits. Q = left thigh forward and
  right back, W the reverse; O = left knee bent and right straight, P the reverse; ankles hold the feet square to
  the calves, arms swing with the opposite leg. Feet are heavy (density 0.01): light feet were tipped over by the
  contact solver. Head or torso touching the pavement is a fall (limp ragdoll, `boom`, a `falls` line with the
  street, a fact, best in localStorage `qwop-best`); Space, Enter, R or click restarts. Tuned in a Node sim: a
  Q+O / - / W+P / - rhythm at 0.1 s per step walks ~4 m in 30 s without falling, random mashing falls in 2 to 10 s.
  `index.ts`: plain 2D canvas, physics stepped by hand at 60 Hz (runner stopped, x0.7 under reduced motion). The
  route (`route`, `end` 2,700 m, `landmarks` with real facts from the guide's getting-here section and
  `accommodation.md`) is compressed by `scale` 20: each metre walked is 20 m of route, and the HUD, pavement markers,
  street signs and landmark posts use route metres. Street-coloured building facades in 9 m slots, pavement with slab
  joints, road with dashes, a brick Great Gate past the end. Runner: LMBC red blazer with gold buttons and collar,
  navy trousers, red and white scarf as a verlet chain from the neck, random roster face as the head (plain head
  without a roster). HUD: route distance, street, timer, best, Q/W/O/P key caps lit while held; a red/gold banner
  shows each landmark's fact; footsteps thud. Reaching 2,700 m shows a win card with the time against the guide's
  40 minutes. Verified in headless Chromium: standalone at 1280px (standing, walking with the rhythm, mashing to a
  fall, fall card, restart), opened from the Accommodation heading on `/` (Esc closes) and from "walk from the
  station" on `/freshers` (X closes), iPhone emulation shows the desktop-only notice, no page errors. A temporary
  teleport hook used to check later streets, landmark banners, the Great Gate and the win card was removed.

### Phase 24 - Crew bumps (redcoats)  `[ ]`  trigger: history punt mishaps / Sports | touch: desktop-only
- Side-scrolling Cam reach (Grassy Corner, Ditton, Plough Reach labels). LMBC boat, red blades. At game start, assign a
  random key to each of the 8 oars (fixed for that game, new set next game). Pressing an oar's key strokes it; uneven
  strokes yaw the boat; hitting the bank is allowed (crash, recover). Catch the boat ahead -> "BUMP!" -> prize screen:
  a willow sprig to put in your hair (drag onto a roster face).

### Phase 25 - Operation: formal plate  `[ ]`  trigger: Swaps / Formal Halls | touch: drag
- Drag hall food items (roast potato, Yorkshire pudding, peas, jus...) onto a plate with Matter collisions. Every
  collision adds a surcharge to a running UPay bill. Real info: BA Table Tue/Fri, swap partners as menu names.
UPDATE: This should not be formal plate but just dining hall, because that's
where you get a main and you add your own sides, and try not to get it to spill
off the plate onto the tray

### Phase 26 - Pacman: Fisher Building  `[x]`  trigger: Ents / sBrOILER ROOMS | touch: swipe
- Maze is the Fisher Building; goal is the dancefloor. Bouncers chase while shouting speech bubbles ("Ticket?",
  "Pay on UPay!", "That's GBP1.50"). Collecting a handle of alcohol turns them into ghosts (frightened mode).
- Notes: `src/games/pacman/{index.ts,data.json}`, registered as `pacman` ("Pacman: Fisher Building") with no extra
  selector: the Ents card heading (`WhatWeDo.astro`) and the "sBrOILER ROOMS" phrase hook already launch it. Kaplay,
  immediate-mode drawing like Crossy Road. The maze is a hand-drawn 21x23 ASCII grid in `data.json` (`#` wall, `.`
  glowstick, `o` handle, `F` dancefloor, `-` velvet rope, `=` security door, `B` bouncer spawns, `P` start, `T`
  tunnel), no dead ends; `labels` (Dancefloor, Bar, Security, Boiler room, Cloakroom, Entrance) are drawn on the
  walls. Navy walls with red edges on a dark club floor, dancefloor tiles cycle colours. Goal: eating every
  glowstick drops the rope ("You're on the list"), and stepping onto the dancefloor clears the level (+500 x level,
  fanfare, fact) and starts the next with bouncers 8% faster (cap 1.4x). Movement is tile-based with a buffered
  turn and instant reversal; the player is a random roster face masked to a circle with a chomping mouth. Four
  bouncers (outlined in red, pink, cyan, orange) use classic scatter/chase phases and targeting (chase, 4 tiles
  ahead, flank off the first, chase until close then retreat), leave the security room on timers and slow in the
  tunnel. A handle makes active bouncers frightened (7s, shorter per level, flashing for the last 2s, random turns,
  half speed); eating one scores 200/400/800/1600 and it returns as eyes to the security room. The nearest active
  bouncer shouts a `shouts` line in a speech bubble every 2.5-4.5s; a frightened one says a `scared` line. 3 lives,
  `caught` line on each catch, game over card with best in localStorage `pacman-best`. Facts (Ents, Instagram,
  Port & Sherry, BA Table, the SBR room, founding) show in a red/gold banner below the maze on each handle and level
  clear. Controls: arrows/WASD, swipe (drag past ~0.7 tiles, chained while held); any key, click or tap starts and
  restarts. Reduced motion runs at 0.7x. Verified in headless Chromium: standalone at 1280px (play, bubbles,
  frightened bouncers, eating one, rope drop and dancefloor win into level 2, being caught, game over, restart),
  opened from "sBrOILER ROOMS" on `/` with Esc closing it, iPhone emulation (tap start, swipe turns, no horizontal
  scroll), no page errors. A temporary debug hook used for the checks was removed.

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

## Follow-up phases

### Phase 31 - Samuel Butler photo transforms  `[x]`
- Every Samuel Butler portrait (the stand-in photo on the committee and anywhere else it shows) gets a random
  transform per element on each load: flip, hue-rotate, swirl/skew, invert, upside down, googly eyes overlay, slow
  spin, pixelate. Registered as a gag in `registry.ts` so it rolls back with the rest.
- Notes: `src/chaos/gags/butler-photos.ts` (gag `butler-photos`, after `butler` so the cloned card is included)
  matches `img[alt*="Samuel Butler"]` (committee stand-ins, the Butler card, the gallery thumb). Every effect loops
  in and out (plain, ease in, hold, ease out) with a random 7-11s cycle and phase per element; spin stays a
  continuous 20s turn. Flip, upside down, hue and invert are inline keyframe `animation`s on the individual
  `scale`/`rotate` properties and `filter`, so they beat scoped styles and compose with the gallery hover
  transform; the stand-in sepia is kept in front via `--bt-base`. Swirl is a per-image SVG turbulence displacement
  filter whose strength is driven by SMIL. Pixelate prerenders 48/28/16/10px canvas copies once the image loads
  (lazy images included) and a timer steps through them and back to the original. Googly eyes wrap the img in a
  span and pop in and out; eye spots are measured on the portrait and mapped through the centre crop, pupils
  follow the pointer. The lightbox img gets a CSS-only effect while it shows Butler, cleared on the next photo.
  Cycles are 3x slower under reduced motion, and all loops (CSS, SMIL, timers) pause with the bus. Verified in
  headless Chromium (timed frames show each effect on and off, lightbox, no console errors on home or history,
  plain portraits with the gag disabled).

### Phase 32 - Committee: Samuel Butler himself  `[x]`
- Add a committee entry "Samuel Butler", role "Antisocial", with the Butler portrait. Its email link opens an in-page
  overlay with a rickroll (YouTube embed, autoplay) instead of `mailto:`. Excluded from game rosters (no photo).
- Notes: `src/chaos/gags/butler.ts` (gag `butler` in the registry, so not in the committee collection). It clones a
  stand-in card from `#committee .members`, renames it, drops the sepia, sets `sb1835@cam.ac.uk`, a one-line bio, and
  appends it last. The email click opens `.rr` (fixed, z `2147483000`) with a youtube-nocookie embed, autoplay;
  X, Esc or a backdrop click closes it. Pauses gags via the bus while open. Pong and gravity skip `.rr`. Verified in
  headless Chromium at 1280px (card, modal opens with no mailto navigation, Esc closes).

### Phase 33 - Daily puzzle lock  `[ ]`
- Classic daily puzzles (Wordle, Connections, Mini crossword, Spelling Bee, Strands), seeded by date so everyone gets
  the same puzzle each day. A random share of internal link clicks are stopped with "This page is locked. Solve
  today's daily puzzle first." Failing is allowed with unlimited retries; Wordle-style limited guesses reset on a new
  attempt. Solved state lasts the day (localStorage, wrapped in try/catch). Words and clues are SBR/St John's themed,
  in a jokes data file.

### Phase 34 - Fox to cat morph rework  `[x]`
- Captcha fox tiles become one shared SVG face (ears, snout, eyes, nose, whiskers, tail, fur) with fox and cat as two
  states. CSS transitions on transforms and colours (and `d` where supported) slide each feature from one shape to
  the other instead of crossfading.
- Notes: the FOX tile in `captcha/tiles.ts` is one set of paths (ears, inner ears, head, mask, eyes, nose) with the fox
  shape in `d`; `.cap-morph` sets the cat shape with CSS `d: path(...)` using the same commands, so they tween over
  3s. Fills tween (orange to grey fur, dark to green eyes, black to pink nose and inner ears), slit pupils and
  whiskers scale in. No tail (the tile is a face). Browsers without CSS `d` (Safari) keep the fox shapes but still get
  the colours, pupils and whiskers. Verified in headless Chromium (frames at 0, 1, 2.3 and 3.8s).

### Phase 35 - Ragdoll timing and water  `[ ]`
- No pile of drops on returning to the tab: while hidden/blurred at most one drop is queued, and it happens once on
  return.
- After 10 minutes on the page a shallow band of water rises at the bottom and the dolls float in it (buoyancy plus
  drag below the waterline, light bobbing, wave drawn on the canvas).

### Phase 36 - Logo movement frenzy  `[x]`
- The hero arms are still at rest. Pointer movement over them drives the animation: more movement, more animation
  (more frequent, bigger, faster loops in `animated-logo.ts`, plus a shake). Moving fast enough makes the logo
  explode: parts fly apart, `boom()`, and it reassembles after a while.
- Notes: pointer travel over the SVG adds energy (`GAIN` per px, gaps over 100ms ignored) that decays with a 600ms
  time constant, so steady movement at v px/ms holds about `v * 0.48`. Each frame every idle motion plays with a
  chance proportional to energy over its `every` delay; amplitude (0.6x to 2.5x) and playback rate (1x to 2.5x) scale
  with energy, and above 0.35 the SVG jitters via CSS `translate`/`rotate`. Energy 1 (a hard scribble, about 2 px/ms)
  explodes it: each leaf `g[data-part]` flies away from the arms' centre with a random spin (WAAPI, 700ms), holds
  1.5s, then flies back. The rAF loop only runs while there is energy. The explosion counts as the "Exploding arms"
  easter egg. Touch: dragging over the logo counts as movement. Verified in headless Chromium (no animations at
  rest, gentle wiggle ramps up, scribble explodes and reassembles, no horizontal scroll).

### Phase 37 - Layout width cleanup  `[x]`
- Header nav, hero title (`Hero.astro` `max-width: 34rem`) and body text (`global.css` `46rem` prose, `.wrap`
  `--wrap`) each sit on a different width. Use one container width for nav, title and section edges, and one prose
  measure left-aligned inside it. Check at 375/860/1280px.
- Notes: `--wrap` is now `56rem`, and `.prose`, `.lead` and the hero tagline have no cap of their own, so the header
  brand and nav, hero, headings, text and card grids share the same left and right edges (192/1088px at 1280px).
  Header still fits one row at 900px; at 860px and below it stacks as before. The gallery lightbox caption keeps
  its 46rem cap (it sits in a modal). Verified home, history, freshers and quick-links at 375/860/900/1280px, no
  horizontal scroll.

### Phase 38 - Corner pong  `[x]`
- Pong starts from a hidden trigger instead of any edge.
- Notes: the cursor must rest in a viewport corner (24px zone) for 500ms; the rally starts on the nearer of the two
  edges. Leaving the corner, leaving the window or a bus pause cancels the timer.

### Phase 39 - Navy theme  `[x]`
- Navy with red accents instead of red with gold.
- Notes: tokens are `--primary`/`--primary-dark`/`--primary-light` (navy `#1b2a4a`) and
  `--accent`/`--accent-dark`/`--accent-light` (red `#c8102e`; light red for text on navy). Neutrals are cool greys.
  Chaos UI hex colours follow the palette. The arms SVGs and in-game palettes are unchanged.

### Phase 40 - Call the Porters  `[x]`
- After the gravity collapse a button puts the page back.
- Notes: "Call the Porters" sits on the page just under the nav bar, where the topmost fallen element below the
  header was. Clicking it removes the bodies and tweens each clone home (last fallen first, 600ms, 15ms stagger),
  then shows the originals and a toast in the same spot ("The Porters have tidied up. Please keep off the grass.").
  The page can collapse again on the next arrival at the bottom.

### Phase 41 - Easter egg counter  `[x]`
- Footer "n/N Easter Eggs found"; clicking it lists every egg and whether it has been found.
- Notes: `src/chaos/eggs.ts` stores found ids in localStorage (`sbr-eggs`) and fires `chaos:egg`. Eggs are gags with
  an `egg` name in `registry.ts` plus every registered game (`eggList()`); a game counts when its overlay opens.
  `src/chaos/egg-counter.ts` renders the button and a `<dialog>` list in `SiteFooter.astro`.

## Verification (whole project)
- `npm run build` clean; `npm run preview` and walk every trigger in the egg table.
- Calendar: subscribe to the deployed `/calendar.ics` in Google Calendar.
- CMS: log in via the Worker, edit an event, confirm the commit and the rebuild.
- Rollback dry run: disable everything in `src/chaos/registry.ts`, and the site is a clean, plain SBR site.
