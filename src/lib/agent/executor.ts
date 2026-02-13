import { AgentTools } from './tools';
import { ProposedAction } from './types';

type ExecutorContext = {
  userId: string;
  actor: string;
  alreadyExecutedActionIds?: Set<string>;
};

export async function executeApprovedActions(
  actions: ProposedAction[],
  tools: AgentTools,
  ctx: ExecutorContext
): Promise<ProposedAction[]> {
  const executed: ProposedAction[] = [];
  const executedIds = ctx.alreadyExecutedActionIds ?? new Set<string>();

  for (const action of actions) {
    if (executedIds.has(action.action_id)) continue;
    if (action.approved !== true) continue;

    const taskId = action.target_task_id;
    if (taskId && action.patch && typeof action.patch.user_id === 'string' && action.patch.user_id !== ctx.userId) {
      throw new Error('Permission denied: cross-user task modification is blocked.');
    }

    if (action.type === 'update_task' && taskId) {
      await tools.updateTask(taskId, action.patch ?? {});
      await tools.logActivity({
        task_id: taskId,
        actor: ctx.actor,
        action_type: 'update_task',
        before_json: null,
        after_json: action.patch ?? null,
        reason: action.reason,
      });
    } else if (action.type === 'archive_task' && taskId) {
      await tools.archiveTask(taskId);
      await tools.logActivity({
        task_id: taskId,
        actor: ctx.actor,
        action_type: 'archive_task',
        before_json: null,
        after_json: { archived: true },
        reason: action.reason,
      });
    } else if (action.type === 'delete_task' && taskId) {
      await tools.deleteTask(taskId);
      await tools.logActivity({
        task_id: taskId,
        actor: ctx.actor,
        action_type: 'delete_task',
        before_json: null,
        after_json: null,
        reason: action.reason,
      });
    } else if (action.type === 'create_task') {
      const created = await tools.createTask({
        user_id: ctx.userId,
        title: String(action.patch?.title ?? 'New Task'),
        ...action.patch,
      });
      await tools.logActivity({
        task_id: created.id,
        actor: ctx.actor,
        action_type: 'create_task',
        before_json: null,
        after_json: created as unknown as Record<string, unknown>,
        reason: action.reason,
      });
    } else if (action.type === 'create_plan') {
      const weekRange = String(action.patch?.week_range ?? '');
      const days = Array.isArray(action.patch?.days) ? (action.patch?.days as any[]) : [];
      await tools.createPlan(weekRange, days);
      await tools.logActivity({
        task_id: null,
        actor: ctx.actor,
        action_type: 'create_plan',
        before_json: null,
        after_json: { week_range: weekRange, days },
        reason: action.reason,
      });
    } else if (action.type === 'answer') {
      await tools.logActivity({
        task_id: taskId ?? null,
        actor: ctx.actor,
        action_type: 'answer',
        before_json: null,
        after_json: { expected_outcome: action.expected_outcome },
        reason: action.reason,
      });
    }

    executed.push(action);
    executedIds.add(action.action_id);
  }

  return executed;
}
