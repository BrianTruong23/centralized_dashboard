import { Task, TaskCategory, TaskEnergyLevel, TaskPriority } from './task';

export interface PlanningConstraints {
  // Planning horizon
  startDate: string; // ISO date string
  endDate: string; // ISO date string

  // Available time blocks by day (optional)
  availableTimeByDay?: {
    [day: string]: { // e.g., "2026-02-11"
      totalMinutes: number;
      blocks?: TimeBlock[];
    };
  };

  // Or simple total hours per day
  hoursPerDay?: number;

  // Hard deadlines (can include existing tasks)
  deadlines?: {
    taskId?: string;
    title: string;
    date: string;
  }[];

  // Priority preferences
  categoryPriorities?: {
    [key in TaskCategory]?: number; // 1-5, higher = more important
  };

  // Energy preferences by time of day
  energyPreferences?: {
    morning?: TaskEnergyLevel; // e.g., "high"
    afternoon?: TaskEnergyLevel;
    evening?: TaskEnergyLevel;
  };

  // Optional: use recent notes as context
  useRecentNotes?: boolean;
  recentNotesDays?: number; // default 7
}

export interface TimeBlock {
  start: string; // HH:mm format, e.g., "09:00"
  end: string; // HH:mm format, e.g., "12:00"
}

export interface PlanItem {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  estimatedMinutes: number;
  energyLevel: TaskEnergyLevel;
  deadline?: string;
  suggestedStart?: string; // ISO date-time string
  suggestedEnd?: string; // ISO date-time string
  taskId?: string; // If this corresponds to an existing task
  planningMetadata?: {
    confidence?: number;
    assumptions?: string[];
    notes?: string;
  };
}

export interface WeeklyPlan {
  id: string;
  userId: string;
  title: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  goals?: string;
  constraints: PlanningConstraints;
  items: PlanItem[];
  status: 'draft' | 'approved' | 'discarded';
  createdAt: number;
  approvedAt?: number;
  discardedAt?: number;
}

export interface GeneratePlanRequest {
  goals: string;
  constraints: PlanningConstraints;
  existingTasks?: Task[];
}

export interface GeneratePlanResponse {
  plan: WeeklyPlan;
  summary: string;
  warnings?: string[];
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  actor: 'user' | 'agent';
  action: 'PLAN_GENERATED' | 'PLAN_APPROVED' | 'PLAN_DISCARDED' | 'TASKS_CREATED_FROM_PLAN' | 'TASK_UPDATED_FROM_PLAN_EDIT';
  entityType?: 'plan' | 'task';
  entityId?: string;
  metadata?: {
    count?: number;
    planId?: string;
    taskIds?: string[];
    [key: string]: any;
  };
  createdAt: number;
}
