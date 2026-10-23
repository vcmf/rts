// Era data: the Napoleonic uniforms the figures wear (docs/plans/active/armies-demo.md; decision 0015: the engine
// names no army, a battalion names its uniform by id). Colours by the figure's colour roles (tools/bake-figure.py);
// the coats are the art bible's (docs/art-bible.md §4), the roles it gives no colour for keep the French figure's
// neutral stand-ins. A uniform is worn by whichever side's battalions name it: a white coat is not an army.
// The flags: simplified to vertical bands from the staff out (the regimental colour's field)
import type { Uniform } from '../sim/ruleset.ts'

const NEUTRAL = { dark: '#2A2B31', skin: '#C89474', leather: '#7A5C3E', pack: '#8C7152', wood: '#5E3F26', metal: '#A3A6AB' }

export const UNIFORMS: Readonly<Record<string, Uniform>> = {
  // the French line infantry after 1808: blue coat, red facings, white waistcoat and breeches; the 1804 colour
  'fr-line-1808': { id: 'fr-line-1808', colours: { coat: '#2C4FA8', facings: '#B8322A', white: '#EDE6D6', ...NEUTRAL }, flag: ['#2C4FA8', '#EDE6D6', '#B8322A'] },
  // the Austrian line infantry: white coat, regimental facings (here a crimson); the yellow and black colour (the
  // eagle reduced to its black band). The French figure recoloured: a stand-in until its own figure exists
  'at-line-white': { id: 'at-line-white', colours: { coat: '#E9E3D3', facings: '#8E2F3A', white: '#DCD6C8', ...NEUTRAL, dark: '#26272B' }, flag: ['#E3B935', '#1E1E1E', '#E3B935'] },
}
