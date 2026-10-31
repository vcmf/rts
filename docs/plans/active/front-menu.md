---
status: active
last_reviewed: 2026-10-31
---

# Plan: the front menu, the History screens and the interface language

Asked by the owner (2026-10-31): "lets do ui elements / [visual] language for our game … simple design a bit like
this [a hairline box with crosshair ticks at two corners] with beige / warm colour … show me a home page then options
(most are muted for now) campaign battles history, and go to history shows commanders and units". Then: "make it
proper with good structure, good abstractions and good tests". The interface language it builds on:
`docs/proposals/staff-map/design.md` §8. The decision this plan makes: 0100.

## Scope

In:

- **The interface language as code**: one stylesheet of tokens (paper, ink, pencil, one selection accent, the army
  colours as data) and elements (the ticked frame, buttons, menu items, tags, tabs, chips, settings controls, gauges,
  tooltip, dialog, dispatch, cards, battle cartouche, status bar, unit panel), `src/ui/theme.css`.
- **A specimen page**, `app/ui-kit.html`: every element and its states (rest, hover, focus, pressed, disabled, muted).
- **The front menu page**, `app/menu.html`: home (Campaign, Battles and Settings muted; History live), History (two
  plates), the rosters (commanders, regiments; by nation, regiments also by arm), the full plate of one entry
  (previous / next). Routes in the hash; keyboard: arrows, Enter, Esc.
- **The roster data**: `data/history/roster.json` and its thumbnails, built from the design libraries
  (the generals and units under design/, not in git) by `tools/build-history-data.ts`.

Out: the background art (the home stays empty paper), Campaign, Battles and Settings themselves, other languages
(English only for now), sound, a gamepad.

## Approach

- **Era-generic code** (decision 0015): `src/ui/` never names a nation, unit or person. The nations (names, native
  names, army colours), the arm keywords and the order come from `tools/history-content.ts`, written into the roster.
- **Pure logic, thin DOM** (`docs/conventions.md`, Tests): routes (`route.ts`: parse, format, parent), roster queries
  (`roster.ts`), menu stepping and keys (`keys.ts`), the plate's facts (`plate.ts`) are pure functions with Vitest
  tests; the screens (`screens/*.ts`) only turn their results into elements.
- **Images**: 720 px JPEG thumbnails (macOS `sips`), committed under `data/history/`, bundled by Vite through
  `import.meta.glob`. The full paintings stay in `design/` (not shipped).
- **The data tool**: its parsers (`tools/history-sources.ts`) are pure and tested on small HTML samples; `--check`
  rebuilds the roster in memory and compares it (locally: `design/` is not in git, so CI does not run it).

## Acceptance

- `npm test` passes, with tests for routes, roster queries, keys, plate facts, the source parsers and the committed
  roster's integrity (unique ids, every image present, every nation and arm known).
- `node tools/menu-check.ts <url>` passes on the built page (every route renders what the roster says, every image
  loads, no horizontal scroll at 1440 and 390 px, muted items refuse focus and clicks, Esc walks back), and its
  `--selftest` fails on each sabotage.
- Screenshots of every screen at 1440 × 900 and 390 × 844, looked at.

## Decided

- **Experience markers: Honours** (the owner, 2026-10-31) for the unit model's six levels: every mark filled; a bar,
  one and two chevrons for the line, a star, a star over a bar, a star in a laurel for the Guard. Sleeve and Shield
  were the other candidates.
- **The selection accent: gamboge** (the owner, 2026-10-31), a wash under ink lines (decision 0100). Terracotta read
  as a brand orange; verdigris and violet were the other candidates.

- **Unit bars**: continuous, one colour each (the owner asked for it, 2026-10-31): bistre toughness, verdigris
  morale, violet fatigue; one plain style for every unit and value (the owner, 2026-10-31: no styles of their own for
  low or critical), the numbers always written: current / max (men left, morale, fatigue).
- **Six categories, three mode groups** (the owner, 2026-10-31): line and light infantry, heavy and light cavalry,
  heavy and light artillery, each its icon; a unit's formation, weapon mode (melee or firearm) and fight mode (fire
  at will or hold fire) set on its panel as icon toggles. The battle card bigger, without a frame, less padding.
- **Icons over words, cards with big paintings** (the owner, 2026-10-31): icons for melee, musket and rifle fire,
  the shapes (ranks as lines, like Total War), and the three arms (the gun reused from the staff map); words as
  tooltips or subtitles; unit cards in three layouts with the three bars standing beside the painting.

## Open questions

- The horse and shako icons are drawn here; the owner offered SVGs of a horse and a gun if better ones are wanted.

- The game's title ("Empires" is a placeholder).
- Prussia's and Poland's army colours (`#23324a`, `#9c2440`) are provisional: the art bible names only France,
  Russia, Britain (and the staff map Austria).
