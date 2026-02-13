import { getPlantStage } from './focusPlant';

describe('getPlantStage', () => {
  it('returns seed stage for short focus time', () => {
    expect(getPlantStage(0)).toBe(0);
    expect(getPlantStage(299)).toBe(0);
  });

  it('advances at 5 minutes', () => {
    expect(getPlantStage(300)).toBe(1);
  });

  it('advances at 15 minutes', () => {
    expect(getPlantStage(900)).toBe(2);
  });

  it('advances at 30 minutes', () => {
    expect(getPlantStage(1800)).toBe(3);
  });

  it('reaches bloom at 45 minutes', () => {
    expect(getPlantStage(2700)).toBe(4);
  });
});
