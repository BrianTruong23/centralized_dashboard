export type TaskPriority = 1 | 2 | 3 | 4 | 5;
export type TaskEnergyLevel = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'doing' | 'done';

// Categories are now effectively Projects, so we allow any string
export type TaskCategory = string;

export interface Task {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  estimatedMinutes: number;
  deadline?: string; // ISO date string (YYYY-MM-DD)
  start_time?: string; // ISO date string or full timestamp
  end_time?: string; // ISO date string or full timestamp
  due_time?: string; // ISO time string (HH:MM:SS)
  scheduled_date?: string; // ISO date string (YYYY-MM-DD)
  scheduled_time?: string; // ISO time string (HH:MM:SS)
  is_all_day?: boolean;
  energyLevel: TaskEnergyLevel;
  status: TaskStatus;
  tags: string[];
  createdAt: number; // timestamp
  project_id?: string; // Project this task belongs to

  // Weekly planning fields
  source?: 'user' | 'agent';
  suggestedStart?: string;
  suggestedEnd?: string;
  planningWeekId?: string;
  planningMetadata?: Record<string, any>;
}
