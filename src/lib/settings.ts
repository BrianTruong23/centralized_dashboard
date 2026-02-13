/**
 * Settings storage helper for user preferences
 */

const SETTINGS_KEY = 'life_dashboard_settings';

export interface UserSettings {
  plantGrowthEnabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  plantGrowthEnabled: true,
};

export const saveSettings = (settings: Partial<UserSettings>): void => {
  if (typeof window === 'undefined') return;
  try {
    const currentSettings = loadSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
  } catch (error) {
    console.error('Failed to save settings to localStorage:', error);
  }
};

export const loadSettings = (): UserSettings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (error) {
    console.error('Failed to load settings from localStorage:', error);
    return DEFAULT_SETTINGS;
  }
};
