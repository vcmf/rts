// Era data: the Napoleonic dyes (docs/plans/active/dye-palette.md, decision 0068): the cloth colours every uniform
// is painted from (src/rulesets/napoleonic-uniforms.ts names them by cloth part), each one sRGB value chosen once
// against the landscape (the epic ground under the battalions: L* 47 to 81 and C* 13 to 44 in summer, L* 52 to 68 on
// snow: the plan's measures); the flags' own dyes, brighter and cleaner, so a side reads by its colours; the materials
// that are not cloth; the boots' dye. The owner's picks, 2026-10-26
import type { DyeSet } from '../sim/ruleset.ts'

export const DYES: DyeSet = {
  dyes: {
    // the French coat (bleu impérial, indigo and woad): the owner's dark blue (2026-10-26; the navy #1F2B52 was the
    // other candidate)
    'imperial-blue': '#26386E',
    // the hussars' and the Hungarian trousers' light blue
    'sky-blue': '#7F9CC6',
    // madder: the French facings, the British rankers' coat (brick red, not an officer's scarlet)
    'madder-red': '#A8322B',
    // the Austrian and the Guard's darker reds (regimental facings)
    crimson: '#8E2F3A',
    // buff: British facings
    buff: '#C9A862',
    // undyed wool and pipeclay: the Austrian coat, the breeches, the waistcoats, the belts
    white: '#E8E2D2',
    // three greens kept apart: the Russian line's dark green, the French dragoons' lighter, yellower green, the
    // British rifles' near-black green
    'russian-green': '#2A5434',
    'dragoon-green': '#3E6E3C',
    'rifle-green': '#22402F',
    // the Grenz infantry's brown
    'grenzer-brown': '#5E4030',
    // pike grey (hechtgrau): the Austrian Jäger, the British trousers
    'pike-grey': '#8693A0',
    // greatcoats: undyed grey, the French beige-grey capote, the Russian grey-brown; darker than the summer ground's
    // middle so they read on snow, where they are worn
    'greatcoat-grey': '#66655F',
    'greatcoat-beige': '#8A806E',
    'greatcoat-brown': '#5E5448',
    // black: boots, gaiters, shakos, bearskins, the rifles' facings
    black: '#24252B',
  },
  // the flags' own dyes (the owner: beautiful and standing out, not out of the painted palette): the colours the
  // flags flew before the dye set, the Russian green the art bible's
  flags: {
    'flag-blue': '#2C4FA8',
    'flag-white': '#EDE6D6',
    'flag-red': '#B8322A',
    'flag-yellow': '#E3B935',
    'flag-black': '#1E1E1E',
    'flag-green': '#2F6B3C',
  },
  // not cloth: the figure's neutral roles, per era (the owner, 2026-10-26)
  materials: { skin: '#C89474', leather: '#7A5C3E', pack: '#8C7152', wood: '#5E3F26', metal: '#A3A6AB' },
  boots: 'black',
}
