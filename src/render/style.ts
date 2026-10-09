// How each terrain class looks on the staff map, keyed by class name (render content, not sim data):
// a fill, an edge drawn where the class meets another, a symbol scattered over it, and how densely
// trees stand in it. Classes not listed draw as open ground.
export interface ClassStyle { fill?: string; edge?: string; edgeWidth?: number; symbol?: 'stipple' | 'furrows' | 'reeds' | 'beads'; trees?: number }
export const CLASS_STYLE: Record<string, ClassStyle> = {
  open: {},
  road: { fill: '#f3efe6', edge: '#8a6a46', edgeWidth: 1.2 },
  crops: { fill: '#efe5c4', edge: 'rgba(138,106,70,.45)', symbol: 'stipple' },
  ploughed: { fill: '#ece0c9', edge: 'rgba(138,106,70,.5)', symbol: 'furrows' },
  rough: { fill: '#ebe4d6' },
  woods: { fill: '#e2e6d2', edge: '#55703f', trees: 0.22 },
  denseWood: { fill: '#d3dbc0', trees: 0.45 },
  marsh: { fill: '#dfe7de', symbol: 'reeds' },
  hedge: { fill: '#9fb08a', edge: '#55703f', symbol: 'beads' },
  bridge: { fill: '#f3efe6', edge: '#211f1c', edgeWidth: 1.4 },
  water: { fill: '#cfe0e2', edge: '#3f6f86', edgeWidth: 1 },
}
export const INK = { paper: '#f3efe6', offMap: '#ddd5c5', ink: '#211f1c', ink2: '#5f5a52', ink3: '#a19a8f', contour: '#a0714a', contourIx: '#7d5534', grid: 'rgba(40,30,20,.08)',
  waterInk: '#3f6f86', woodInk: '#55703f', shallow: '#e3edee' }
export const SIDE_INK = ['#2c4fa8', '#a8322c']
