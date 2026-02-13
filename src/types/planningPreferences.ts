export type EnergyPeak = 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'night' | 'varies';

export interface PlanningPreferences {
  energyPeak: EnergyPeak;
  deepWorkMinutes: number;
  breakMinutes: number;
  workDays: string; // free-form like "Mon-Fri"
  personalConstraints: string; // meetings, family hours, etc.
  planningNotes: string; // extra context for AI planning
}

export const defaultPlanningPreferences: PlanningPreferences = {
  energyPeak: 'morning',
  deepWorkMinutes: 90,
  breakMinutes: 15,
  workDays: 'Mon-Fri',
  personalConstraints: '',
  planningNotes: '',
};
