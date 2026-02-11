import { Task, TaskCategory, TaskEnergyLevel, TaskPriority } from './task';

export type WeeklyPlanStatus = 'draft' | 'approved' | 'discarded';

export interface TimeBlock {
  day: number; // 0=Sunday, 1=Monday, etc.
  startHour: number; // 0-23
  endHour: number; // 0-23
}

export interface PlanningConstraints {
  // Planning horizon
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)

  // Available time
  availableTimeBlocks?: TimeBlock[];
  totalHoursPerDay?: number; // Alternative to time blocks

  // Priorities
  priorityPreferences?: string; // e.g., "school > research > personal"

  // Energy preferences
  energyPreferences?: {
    morningEnergy?: TaskEnergyLevel; // What energy level in morning
    afternoonEnergy?: TaskEnergyLevel;
    eveningEnergy?: TaskEnergyLevel;
  };

  // Deadlines
  hardDeadlines?: {
    taskId?: string;
    title: string;
    deadline: string; // ISO timestamp
  }[];

  // Context from notes
  useNotesContext?: boolean;
  notesDaysBack?: number; // How many days of notes to consider
}

export interface WeeklyPlanItem {
  id: string;
  plan_id: string;
  task_id?: string; // May be null if task not yet created
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  estimatedMinutes: number;
  energyLevel: TaskEnergyLevel;
  suggested_start?: string; // ISO timestamp
  suggested_end?: string; // ISO timestamp
  day_of_week: number; // 0-6 (Sunday=0)
  sequence_order: number;
  createdAt: number;
}

export interface WeeklyPlan {
  id: string;
  user_id: string;
  title: string;
  goals?: string;
  constraints: PlanningConstraints;
  start_date: string; // ISO date
  end_date: string; // ISO date
  status: WeeklyPlanStatus;
  items: WeeklyPlanItem[];
  createdAt: number;
  updatedAt: number;
}

export interface PlanGenerationRequest {
  userId: string;
  goals: string;
  constraints: PlanningConstraints;
  existingTasks?: Task[]; // Include existing tasks to consider
  notes?: string; // Optional notes content for context
}

export interface PlanGenerationResponse {
  plan: WeeklyPlan;
  summary: string;
  warnings?: string[];
}

// For activity logging
export type PlanActivityType =
  | 'PLAN_GENERATED'
  | 'PLAN_APPROVED'
  | 'PLAN_DISCARDED'
  | 'TASKS_CREATED_FROM_PLAN'
  | 'TASK_UPDATED_FROM_PLAN_EDIT';

export interface PlanActivity {
  id: string;
  type: PlanActivityType;
  actor: 'user' | 'agent';
  plan_id?: string;
  task_count?: number;
  metadata?: Record<string, any>;
  created_at: number;
}
