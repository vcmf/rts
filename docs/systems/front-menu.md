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

- **The roster** (`src/ui/roster.ts`): nations, arms, featured ids, commanders (name, role, life, likeness note,
  image) and regiments (library number, name, detail, arm, image). `rosterProblems` checks it (unique ids, known
  nations and arms, an image each, the featured entries present); the page refuses an unsound roster, the data tool
  refuses to write one, and a test checks the committed one.
- **Routes** (`src/ui/route.ts`): `#home`, `#history`, `#roster/<kind>/<nation>/<arm>[/<open>]`. `parseRoute` reads
  what is written; `normalizeRoute` repairs it against the roster (an unknown army becomes the first, commanders and
  unknown arms show every arm, a plate index past the entries closes the plate) and the page rewrites the hash in
  place. `parentRoute` is one level up: plate → roster → History → home.
- **Keyboard** (`src/ui/keys.ts`): on home, ↑ and ↓ move between live items (muted ones are skipped, `stepLive`) and
  Enter opens the chosen one; on a plate, ← and → turn to the previous and next entry; Esc goes one level up
  everywhere. A key the screen does not use is left to the browser.
- **What a card and a plate say** (`src/ui/plate.ts`): a regiment keeps its library number ("No. 13") and shows its
  arm; a commander is numbered by his place ("Fig. 04"). The plate lists life, likeness note and army (regiment:
  arm and army), leaving out what the library leaves empty.
- **Screens** (`src/ui/screens/`): each fills the markup `app/menu.html` gives it (`data-slot` holes) from the route
  and the roster; none keeps state but the home menu's selection. `src/ui/elements.ts` builds the elements made in
  code (the card, the meter), shared by the screens and the specimen sheet.
- **The interface language** (`src/ui/theme.css`, decision 0100): tokens (paper, raised and sunk paper, ink, soft
  ink, pencil, rule, the one accent), type (condensed display, text, mono labels, mono data), the ticked frame and the
  elements: buttons, menu items, tags and stamps, tabs, chips, crumbs, settings controls (switch, scale-bar range,
  segmented choice, check, select, ruled input), meters and progress, tooltip, dialog, dispatch, cards, and the
  battle's cartouche, unit panel and status bar. Each interactive element also takes `.is-hover`, `.is-focus` and
  `.is-active`, so the sheet can show its states side by side.
- **The specimen sheet** (`app/ui-kit.html`, `src/ui/kit.ts`, layout `src/ui/kit.css`): every element in every state,
  with the rule behind it. A new element joins the theme and the sheet in the same change.

## Tunables

- The armies and their colours, the arm rules, the featured entries: `tools/history-content.ts` (then rebuild).
- The thumbnails' size and quality: `THUMB_PX`, `THUMB_QUALITY` in `tools/build-history-data.ts`.
- Colours, type, line weights, the frame's ticks and the motion: the tokens at the top of `src/ui/theme.css`.

## Verification

- `npm test`: routes, roster queries, keys, captions and plates, meters (`test/ui-*.test.ts`), the library parsers
  (`test/history-sources.test.ts`) and the committed roster: sound, every image present and none extra, in step with
  its content and arm rules (`test/history-data.test.ts`).
- `node tools/menu-check.ts <built menu URL>` (after `npm run build` and `npx vite preview`): at 1440 × 900 and
  390 × 844, no screen wider than the window; muted items unfocusable and unclickable; History's counts and plates;
  every army's roster of each kind and arm shows exactly the roster's entries; a plate opens, turns and Esc walks
  back to home; every card's thumbnail loads. `--selftest` also runs four sabotages (a regiment dropped, a muted item
  focusable, a page too wide, Esc swallowed) and fails unless each is caught.
- `node tools/build-history-data.ts --check`: the committed roster matches the design libraries (locally: `design/`
  is not in git).

## Open questions

- The game's title ("Empires" is a placeholder).
- Prussia's and Poland's colours are provisional; the art bible names France, Russia and Britain, the staff map
  Austria.
- The home's background: empty paper until the art exists.
