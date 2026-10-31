// The selection accent's candidates (src/ui/theme.css, `data-accent`), chosen by `?accent=` on any interface page
// while the owner decides (docs/plans/active/front-menu.md, open questions).

export const ACCENTS = ['terracotta', 'gamboge', 'verdigris', 'violet'] as const
export type Accent = (typeof ACCENTS)[number]
/** The research's recommendation (a gamboge wash under ink lines), shown when the address names none. */
export const DEFAULT_ACCENT: Accent = 'gamboge'

/** The accent a page's query string names; the default for none or an unknown one. */
export function accentOf(search: string): Accent {
  const named = new URLSearchParams(search).get('accent')
  return ACCENTS.find(a => a === named) ?? DEFAULT_ACCENT
}

/** Sets `accent` on the document (the theme's `:root[data-accent]`); terracotta is the theme's own. */
export function applyAccent(accent: Accent): void {
  if (accent === 'terracotta') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = accent
}
