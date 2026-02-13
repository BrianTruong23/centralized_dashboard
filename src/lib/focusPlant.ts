export type PlantStage = 0 | 1 | 2 | 3 | 4;

// Stage progression is intentionally slow and subtle.
// 0: seed, 1: sprout, 2: small plant, 3: grown, 4: bloom
export function getPlantStage(focusSeconds: number): PlantStage {
  if (focusSeconds >= 45 * 60) return 4;
  if (focusSeconds >= 30 * 60) return 3;
  if (focusSeconds >= 15 * 60) return 2;
  if (focusSeconds >= 5 * 60) return 1;
  return 0;
}
