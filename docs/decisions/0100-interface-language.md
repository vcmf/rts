---
status: proposed
date: 2026-10-31
---

# 0100 The interface language: ink on warm paper, ticked frames, colour only for the armies

The plan: `docs/plans/active/front-menu.md`; as built: `docs/systems/front-menu.md`; the specimen sheet:
`app/ui-kit.html`.

## Context

The owner, 2026-10-31, asked for the game's interface elements and visual language: "simple design a bit like this"
(a sketch of a hairline box with crosshair ticks crossing at two opposite corners), "beige / warm colour", starting
with the home page and the History screens. The staff map's design already set an interface language for its chrome
(`docs/proposals/staff-map/design.md` §2, §8: paper and ink, hairline frames with crosshair ticks, a condensed
grotesk, a mono for data, one accent per army), but only for that map, and nothing in code.

## Decision

- **One interface language for every screen**, extending the staff map's §8 to the whole game: warm paper
  (`#ece3d2`, raised `#f6efe3`, sunk `#e2d7c3`), warm graphite ink (`#2b2824`, never black), pencil (`#8a847a`).
- **Colour belongs to the armies**, set from data; the interface's only other colour is **one accent for selection
  and focus: gamboge** (`#e4b412`), the yellow wash period plans laid over projected works (Vauban's convention;
  the Clements Library's bulletin 4 on French wash manuals). It is too light for a line or text (1.5:1 on paper), so
  it is a wash and a fill under ink lines; the owner chose it over verdigris and violet (2026-10-31). A first
  terracotta read as a brand orange.
- **The ticked frame** (the owner's sketch) contains everything that can be chosen; its ticks grow when it has
  attention.
- **Pencil means not yet**: what cannot be used yet is drawn grey and dashed, stays visible, and cannot be chosen by
  pointer, Tab or arrows.
- **Flat and modern**: no shadows, bevels, glows or rounded corners; Instrument Sans condensed for titles, Hanken
  Grotesk for text, JetBrains Mono for labels and data; no imitation period type (the staff map's rule).
- **One stylesheet** (`src/ui/theme.css`) holds the tokens and elements, and **one specimen sheet**
  (`app/ui-kit.html`) shows every element in every state; a new element joins both in the same change.

## Consequences

- New screens (Settings, Campaign, the battle's panels) take their elements from the theme rather than restyling;
  the sheet already shows the settings controls, gauges, dialog, dispatch and battle panel they will need.
- Unit bars take their colours from the same washes (bistre toughness, verdigris morale, violet fatigue), their low
  and critical states drawn, not hued.
- The army colours of Prussia and Poland, not yet set by the art bible, are provisional in the content
  (`tools/history-content.ts`).
- The fonts load from Google Fonts; offline play will need them bundled (later).

## Alternatives considered

A parchment look with period type and ornaments (rejected by the staff map's rule: modern interface, period map); a
dark interface (it fights the warm paintings and the paper map); a component framework (the screens are a few
hundred elements; plain DOM and one stylesheet keep the build as it is).
