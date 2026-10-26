// Era data: the Napoleonic dyes and the uniforms dressed in them (docs/plans/active/dye-palette.md, decision 0068,
// proposed). A TEST SET, behind ?uniforms=dyes on the look page: the page's default uniforms stay those of
// src/rulesets/napoleonic-uniforms.ts. Each dye is one sRGB value, chosen once against the landscape (the epic mood's
// ground sits at L* 50 to 63 in summer, 65 and up on snow, at a C* of 25 to 30 under the battalions: the plan's
// measures); a uniform names a dye per cloth part, never a colour. The values are a first proposal for the owner to
// judge on the sheets (output/armies-review/21-dye-palette), not settled.
import type { DyeSet, Dress } from '../sim/ruleset.ts'

export const DYES: DyeSet = {
  dyes: {
    // the French coat (bleu impérial, indigo and woad): the owner's navy test, #1F2B52 (the darker of the two offered:
    // #26386E is the other, ?dye=imperial-blue:%2326386E)
    'imperial-blue': '#1F2B52',
    // the hussars' and the Hungarian trousers' light blue
    'sky-blue': '#7F9CC6',
    // madder: the French facings, the British rankers' coat (brick red, not an officer's scarlet)
    'madder-red': '#A8322B',
    // the Austrian and the Guard's darker reds (regimental facings)
    crimson: '#8E2F3A',
    // buff and yellow: British facings, the Austrian colours' field
    buff: '#C9A862',
    yellow: '#D6AE3C',
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
  // not cloth: the figure's neutral roles, as today's uniforms paint them
  materials: { skin: '#C89474', leather: '#7A5C3E', pack: '#8C7152', wood: '#5E3F26', metal: '#A3A6AB' },
  boots: 'black',
}

// The test's uniforms (the brief's eight; the figure is the French line infantryman for all of them, recoloured: the
// shapes, a bearskin, a helmet, a rifle, are later steps)
export const DRESS: Readonly<Record<string, Dress>> = {
  // the French line infantry after 1808: blue coat, red collar and cuffs (the lapels are the figure's white role),
  // white waistcoat and breeches, black shako; the beige-grey capote in winter
  'fr-line': {
    id: 'fr-line',
    parts: {
      coat: 'imperial-blue',
      facings: 'madder-red',
      trousers: 'white',
      waistcoat: 'white',
      headgear: 'black',
      greatcoat: 'greatcoat-beige',
    },
    flag: ['imperial-blue', 'white', 'madder-red'],
  },
  // the Guard's grenadier: the line's colours on this figure (his bearskin, epaulettes and white lapels are shapes it
  // lacks); his capote is dark blue, so he differs from the line in winter
  'fr-guard-grenadier': {
    id: 'fr-guard-grenadier',
    parts: {
      coat: 'imperial-blue',
      facings: 'madder-red',
      trousers: 'white',
      waistcoat: 'white',
      headgear: 'black',
      greatcoat: 'imperial-blue',
    },
    flag: ['imperial-blue', 'white', 'madder-red'],
  },
  // a French dragoon regiment on foot: green coat, red facings, white breeches (his brass helmet: the figure's
  // headgear shares its role with the boots); the white-grey cloak
  'fr-dragoon': {
    id: 'fr-dragoon',
    parts: {
      coat: 'dragoon-green',
      facings: 'madder-red',
      trousers: 'white',
      headgear: 'black',
      greatcoat: 'greatcoat-beige',
    },
    flag: ['imperial-blue', 'white', 'madder-red'],
  },
  // the Austrian line (German regiments): white coat, regimental facings (a crimson), white breeches; the grey
  // greatcoat in winter (the owner, 2026-10-17)
  'at-line': {
    id: 'at-line',
    parts: { coat: 'white', facings: 'crimson', trousers: 'white', headgear: 'black', greatcoat: 'greatcoat-grey' },
    flag: ['yellow', 'black', 'yellow'],
  },
  // the Grenz infantry: brown coat, red facings, light blue Hungarian trousers
  'at-grenzer': {
    id: 'at-grenzer',
    parts: {
      coat: 'grenzer-brown',
      facings: 'madder-red',
      trousers: 'sky-blue',
      headgear: 'black',
      greatcoat: 'greatcoat-brown',
    },
    flag: ['yellow', 'black', 'yellow'],
  },
  // the Russian line: dark green coat, red collar and cuffs, white summer trousers; the grey-brown greatcoat
  'ru-line': {
    id: 'ru-line',
    parts: {
      coat: 'russian-green',
      facings: 'madder-red',
      trousers: 'white',
      headgear: 'black',
      greatcoat: 'greatcoat-brown',
    },
    flag: ['russian-green', 'white', 'russian-green'],
  },
  // the British line: madder red coat, buff facings, grey trousers (1812 on); the grey greatcoat
  'br-line': {
    id: 'br-line',
    parts: {
      coat: 'madder-red',
      facings: 'buff',
      trousers: 'pike-grey',
      headgear: 'black',
      greatcoat: 'greatcoat-grey',
    },
    flag: ['imperial-blue', 'madder-red', 'imperial-blue'], // the Union's blue and red, not the tricolour
  },
  // the British rifles: rifle green coat and trousers, black facings and belts (the figure's belts share the
  // trousers' role); the rifles carried no colours (a flag here because every battalion draws one today)
  'br-rifles': {
    id: 'br-rifles',
    parts: {
      coat: 'rifle-green',
      facings: 'black',
      trousers: 'rifle-green',
      headgear: 'black',
      greatcoat: 'greatcoat-grey',
    },
    flag: ['rifle-green', 'black', 'rifle-green'],
  },
}
