export type TaskPriority = 1 | 2 | 3 | 4 | 5;
export type TaskEnergyLevel = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'doing' | 'done';

export type TaskCategory = 
  | 'Research' 
  | 'Coding' 
  | 'Admin' 
  | 'Health' 
  | 'Life' 
  | 'Finance' 
  | 'Social' 
  | 'Content' 
  | 'UX';

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

  // Weekly planning fields
  source?: 'user' | 'agent'; // Track if task was created by agent
  suggested_start?: string; // ISO timestamp for suggested start time
  suggested_end?: string; // ISO timestamp for suggested end time
  planning_week_id?: string; // Reference to weekly plan
  planning_metadata?: Record<string, any>; // Additional planning context
}
