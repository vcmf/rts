// Era data: the Napoleonic uniforms (docs/plans/active/dye-palette.md, decision 0068; decision 0015: the engine names
// no army, a battalion names its uniform by id, whatever its side). Each names a dye per cloth part and its flag's
// bands by flag dye (src/rulesets/napoleonic-dyes.ts), never a colour; the look resolves them onto the figure's roles
// (src/look/world/dyes.ts). The one baked figure is the French line infantryman: every uniform wears his shape (a
// bearskin, a helmet, a rifle are later steps), and his roles show fewer parts than a dress names (the plan's gaps).
// The flags: simplified to vertical bands from the staff out (the regimental colour's field)
import type { Dress } from '../sim/ruleset.ts'

export const UNIFORMS: Readonly<Record<string, Dress>> = {
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
    flag: ['flag-blue', 'flag-white', 'flag-red'],
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
    flag: ['flag-blue', 'flag-white', 'flag-red'],
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
    flag: ['flag-blue', 'flag-white', 'flag-red'],
  },
  // the Austrian line (German regiments): white coat, regimental facings (a crimson), off-white breeches and belts
  // (they read against the coat); the grey
  // greatcoat in winter (the owner, 2026-10-17)
  'at-line': {
    id: 'at-line',
    parts: {
      coat: 'white',
      facings: 'crimson',
      trousers: 'off-white',
      headgear: 'black',
      greatcoat: 'greatcoat-grey',
    },
    flag: ['flag-yellow', 'flag-black', 'flag-yellow'],
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
    flag: ['flag-yellow', 'flag-black', 'flag-yellow'],
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
    flag: ['flag-green', 'flag-white', 'flag-green'],
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
    flag: ['flag-blue', 'flag-red', 'flag-blue'], // the Union's blue and red, not the tricolour
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
    flag: ['flag-green', 'flag-black', 'flag-green'],
  },
}
