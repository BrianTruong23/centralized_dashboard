/**
 * User onboarding preferences
 */
export interface OnboardingPreferences {
  weekStartsMonday: boolean;
  maxTasksPerDay: number;
}

/**
 * Default onboarding preferences
 */
export const defaultOnboardingPreferences: OnboardingPreferences = {
  weekStartsMonday: true,
  maxTasksPerDay: 8,
};

/**
 * User onboarding completion status
 */
export interface OnboardingStatus {
  completed: boolean;
  completedAt?: string;
}
