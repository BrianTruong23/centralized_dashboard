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
  deadline?: string; // ISO date string
  energyLevel: TaskEnergyLevel;
  status: TaskStatus;
  tags: string[];
  createdAt: number; // timestamp
  project_id?: string; // Project this task belongs to

  // Parent-child task relationships (for task breakdown)
  parent_task_id?: string; // Reference to parent task if this is a subtask
  is_subtask?: boolean; // Flag indicating if this is a subtask

  // Weekly planning fields
  source?: 'user' | 'agent';
  suggestedStart?: string;
  suggestedEnd?: string;
  planningWeekId?: string;
  planningMetadata?: Record<string, any>;
}
