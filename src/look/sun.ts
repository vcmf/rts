// The 3D world's sun, toward it (x east, y up, z north; any length): a low side-back light from the north-west, about
// 27° high. The lit staff map is lit by the same sun (G2, decision 0090), so the light does not turn at the zoom's
// handover; this module imports nothing, so the map's bake can read it without Babylon.
export const SUN_TOWARD = [-0.7, 0.45, 0.55] as const
