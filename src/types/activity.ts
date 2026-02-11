export type ActivityActor = 'user' | 'agent' | 'system';

export type ActivityActionType =
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_COMPLETED'
  | 'TASK_UNCOMPLETED'
  | 'TASK_DELETED'
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'NOTE_CREATED'
  | 'NOTE_UPDATED'
  | 'NOTE_DELETED'
  | 'PLAN_GENERATED'
  | 'TASKS_CREATED_FROM_PLAN'
  | 'AGENT_ERROR';

export type ActivityEntityType = 'task' | 'project' | 'note' | 'plan' | null;

export interface ActivityLog {
  id: string;
  user_id: string;
  actor: ActivityActor;
  action_type: ActivityActionType;
  entity_type: ActivityEntityType;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, any> | null;
  created_at: string; // ISO timestamp
}

export interface LogActivityParams {
  userId: string;
  actor: ActivityActor;
  actionType: ActivityActionType;
  entityType?: ActivityEntityType;
  entityId?: string;
  summary: string;
  metadata?: Record<string, any>;
}
