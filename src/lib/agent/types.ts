export type AgentIntent =
  | 'prioritize'
  | 'schedule'
  | 'declutter'
  | 'cleanup'
  | 'qna'
  | 'edit_tasks';

export type AgentActionType =
  | 'create_task'
  | 'update_task'
  | 'archive_task'
  | 'delete_task'
  | 'create_plan'
  | 'answer';

export type AgentTask = {
  id: string;
  user_id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  due_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  priority?: number | null;
  project_id?: string | null;
  labels?: string[] | null;
  estimate_minutes?: number | null;
  inbox?: boolean | null;
  archived?: boolean | null;
};

export type AgentPreference = {
  user_id: string;
  work_hours?: {
    start: string;
    end: string;
  } | null;
  timezone?: string | null;
  max_tasks_per_day?: number | null;
  focus_blocks?: number[] | null;
  scheduling_style?: string | null;
  energy_peak?: string | null;
  planning_notes?: string | null;
};

export type ProposedAction = {
  action_id: string;
  type: AgentActionType;
  target_task_id?: string;
  patch?: Record<string, unknown>;
  destructive: boolean;
  requires_approval: boolean;
  reason: string;
  expected_outcome: string;
  approved?: boolean;
};

export type ProposedPlanDay = {
  date: string;
  task_ids: string[];
  total_minutes: number;
};

export type AgentProposal = {
  intent: AgentIntent;
  analysis_summary: string;
  questions: string[];
  proposed_actions: ProposedAction[];
  proposed_plan?: {
    week_range: string;
    days: ProposedPlanDay[];
  };
};

export type AgentRunRecord = {
  id: string;
  user_id: string;
  request_text: string;
  intent: AgentIntent;
  proposed_plan_json: AgentProposal;
  approved_actions_json: ProposedAction[];
  executed_actions_json: ProposedAction[];
  created_at?: string;
};

