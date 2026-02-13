import { AgentPreference, AgentTask, ProposedPlanDay } from './types';

export type TaskFilter = {
  user_id: string;
  inbox?: boolean;
  archived?: boolean;
};

export type ActivityEvent = {
  task_id: string | null;
  actor: string;
  action_type: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  reason: string;
};

export interface AgentTools {
  listTasks(filter: TaskFilter): Promise<AgentTask[]>;
  createTask(payload: Partial<AgentTask> & { user_id: string; title: string }): Promise<AgentTask>;
  updateTask(id: string, patch: Record<string, unknown>): Promise<void>;
  archiveTask(id: string): Promise<void>;
  deleteTask(id: string): Promise<void>;
  createPlan(weekRange: string, plan: ProposedPlanDay[]): Promise<void>;
  logActivity(event: ActivityEvent): Promise<void>;
  getPreferences(userId: string): Promise<AgentPreference | null>;
  updatePreferences(userId: string, patch: Partial<AgentPreference>): Promise<AgentPreference>;
}

