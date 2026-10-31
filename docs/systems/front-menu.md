---
status: current
last_reviewed: 2026-10-31
code: [src/ui/, app/menu.html, app/ui-kit.html, tools/build-history-data.ts, tools/menu-check.ts]
decisions: [0100-interface-language]
---

# The front menu and the interface language

The game's front menu (`app/menu.html`): a home screen whose items open the game's parts (only History is live so
far), the History screens (commanders and regiments of each army, by arm) and the full plate of one entry. It is
drawn in the interface language of decision 0100, whose elements live in one stylesheet (`src/ui/theme.css`) and
are all shown, with their states, on the specimen sheet `app/ui-kit.html`. The plan: `docs/plans/active/front-menu.md`.

## Goals / non-goals

Goals: one interface language for every screen of the game, written once and shown on one sheet; a front menu that
shows the commanders and regiments the design libraries hold, at desktop and phone widths, by pointer and keyboard.

Non-goals (for now): the home's background art (the paper stays empty), Campaign, Battles and Settings themselves
(drawn muted), other languages, sound, a gamepad.

## Constraints

- **Era-generic code** (decision 0015): `src/ui/` never names a nation, unit or person. The armies (names, native
  names, colours), the arms, the rules that sort cards into arms and the featured entries are content in
  `tools/history-content.ts`, written into the roster. The words of each screen are in the page's markup.
- **Only the armies have colour** (decision 0100): a nation's colour reaches the page as data, set as `--army` on the
  element that shows it (`paintArmy`, `src/ui/dom.ts`); the stylesheet never names an army.
- **The full paintings are not shipped**: the libraries in `design/` are large and not in git; the page shows 720 px
  thumbnails committed under `data/history/`.

## Design

```
the design libraries ──────── tools/build-history-data.ts ──▶ data/history/roster.json + <nation>/<id>.jpg
tools/history-content.ts ─────────────────┘                       │ (Vite bundles both)
                                                                   ▼
location.hash ──parseRoute──normalizeRoute──▶ Route ──▶ screens/home | history | roster | plate  (DOM)
keydown ──keyAction(route, key)──▶ go(route) | step | activate
```

- **The roster** (`src/ui/roster.ts`): nations, arms, the experience levels' names, featured ids, commanders (name, role, life, likeness note,
  image) and regiments (library number, name, detail, arm, image). `rosterProblems` checks it (unique ids, known
  nations and arms, an image each, the featured entries present, a nation and a level name at least, no arm named
  like the every-arm filter); the page refuses an unsound roster and says so where its menu would be, the data tool
  refuses to write one, and a test checks the committed one.
- **Routes** (`src/ui/route.ts`): `#home`, `#history`, `#roster/<kind>/<nation>/<arm>[/<entry id>]`. A plate is named
  by its entry's id, not its place, so a link survives a rebuilt roster. `parseRoute` reads what is written (a hash
  that does not decode is home); `normalizeRoute` repairs it against the roster (an unknown army becomes the first,
  commanders and unknown arms show every arm, a plate the filtered roster does not show closes) and the page rewrites
  the hash in place. `parentRoute` is one level up: plate → roster → History → home.
- **History moves** (`Move`): opening something pushes a history entry; turning a plate replaces it; going up (Esc,
  Close) goes back when the page came from there (`upMove`) and replaces otherwise, so Back never reopens what Esc
  closed and a run of turned plates is one entry. A control already showing its route adds no entry; a Back that lands
  elsewhere than the `up` move meant (the user went Back and Forward meanwhile) is corrected in place. The page draws on
  `popstate` alone (a fragment navigation fires it; `hashchange` too would draw twice).
- **Keyboard** (`src/ui/keys.ts`): on home, ↑ and ↓ move between live items (muted ones are skipped, `stepLive`) and
  Enter opens the chosen one; on a plate, ← and → turn to the previous and next entry; Esc goes one level up
  everywhere. A key the screen does not use, or held with Alt, Ctrl or Meta (Alt+← is Back), is left to the browser.
  On home, the selection follows focus and focus follows the selection, so Enter opens what looks chosen.
- **What a card and a plate say** (`src/ui/plate.ts`): a regiment keeps its library number ("No. 13") and shows its
  arm; a commander is numbered by his place ("Fig. 04"). The plate lists life, likeness note and army (regiment:
  arm and army), leaving out what the library leaves empty.
- **Screens** (`src/ui/screens/`): each fills the markup `app/menu.html` gives it (`data-slot` holes) from the route
  and the roster; none keeps state but the home menu's selection. The grid is redrawn only when its kind, nation or
  arm changes (`sameGrid`), not when a plate opens or turns. The plate is modal: the roster behind it is inert, focus
  goes to Close as it opens and back to the card last shown as it closes. `src/ui/elements.ts` builds the elements made in
  code (the card, the meter), shared by the screens and the specimen sheet.
- **The interface language** (`src/ui/theme.css`, decision 0100): tokens (paper, raised and sunk paper, ink, soft
  ink, pencil, rule, the one accent: a gamboge wash under ink lines; the unit bars' colours), type (condensed display, text, mono labels, mono data), the ticked frame and the
  elements: buttons, menu items, tags and stamps, tabs, chips, crumbs, settings controls (switch, scale-bar range,
  segmented choice, check, select, ruled input), continuous unit bars (one plain style, `current/max` always written) and progress,
  experience markers for the unit model's six levels (`src/ui/levels.ts`: the line's levels counted marks, the
  Guard's a star family: the Honours series), tooltip, dialog, dispatch, cards, and the
  battle's cartouche, unit panel and status bar. Each interactive element also takes `.is-hover`, `.is-focus` and
  `.is-active`, so the sheet can show its states side by side.
- **Icons** (`src/ui/icons.ts`, drawn by `src/ui/glyph.ts` like the level markers): six categories from the unit
  model's tags (`categoryIcon`: line infantry a shako, light infantry a hunting horn, heavy cavalry a helmet, light
  cavalry a horse, heavy artillery the staff map's gun with its shot, light (horse) artillery the gun under a
  horseshoe), the weapon modes (melee: crossed sabres; fire: a musket; aimed fire: a rifle), the fight modes (fire at
  will: a range ring; hold fire: the ring crossed through), the shapes drawn as Total War draws formations, each rank
  a line, and the metrics (toughness, morale, fatigue). Icons lead and words follow: each carries its word as a tooltip
  (`data-tip`, on hover and keyboard focus) and an accessible name; screens show words as small subtitles at most.
- **Unit cards** (`unitCard`, `src/ui/elements.ts`), three layouts, each with the painting large and the three bars
  standing beside it (`verticalBars`, each under its metric's icon, its `current/max` under it, `barText`):
  `portrait` (rosters: icons under the painting), `battle` (the battle's unit bar: bare and large, category and level
  on paper chips over the painting, the modes set along its bottom, the name a tooltip), `panel` (the selected unit:
  name, category and level, then its mode groups as icon toggles). A unit's modes are groups of options
  (`ModeGroup`: formation, weapon, fight; `currentMode`), the ruleset's to define.
- **The specimen sheet** (`app/ui-kit.html`, `src/ui/kit.ts`, layout `src/ui/kit.css`): every element in every state,
  with the rule behind it. A new element joins the theme and the sheet in the same change.

## Tunables

- The armies and their colours, the arm rules, the featured entries: `tools/history-content.ts` (then rebuild).
- The thumbnails' size and quality: `THUMB_PX`, `THUMB_QUALITY` in `tools/build-history-data.ts`. What each thumbnail
  was made from (the settings, each source's sha256) is recorded in `data/history/thumbs.json`; a thumbnail is remade
  when either changes.
- Colours, type, line weights, the frame's ticks and the motion: the tokens at the top of `src/ui/theme.css`.

## Verification

- `npm test`: routes, roster queries, keys, captions and plates, meters (`test/ui-*.test.ts`), the library parsers
  (`test/history-sources.test.ts`) and the committed roster: sound, every image present and none extra, in step with
  its content and arm rules (`test/history-data.test.ts`).
- `node tools/menu-check.ts <built menu URL>` (after `npm run build` and `npx vite preview`): at 1440 × 900 and
  390 × 844, no screen wider than the window; muted items unfocusable and unclickable; History's counts and plates;
  every army's roster of each kind and arm shows exactly the roster's entries; a plate opens, turns and Esc walks
  back to home, focus on Close while a plate is open (the roster inert) and back on the card after; every card's
  thumbnail loads; pressed controls add no history; Next at the last entry leaves focus on Close. `--selftest` also runs six sabotages (a regiment dropped, focus left behind, a pressed tab pushing
  history, a muted item focusable, a page too wide, Esc swallowed) and fails unless each is caught.
- `node tools/build-history-data.ts --check`: the committed roster and thumbnail record match the design libraries
  (locally: `design/` is not in git; from a worktree, `HISTORY_DESIGN=<main checkout>/design`).

## Open questions

- The game's title ("Empires" is a placeholder).
- Prussia's and Poland's colours are provisional; the art bible names France, Russia and Britain, the staff map
  Austria.
- The home's background: empty paper until the art exists.
