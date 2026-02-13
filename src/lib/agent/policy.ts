import { ProposedAction } from './types';

const DESTRUCTIVE_TYPES = new Set(['delete_task', 'archive_task']);

export function policyGate(actions: ProposedAction[]): ProposedAction[] {
  return actions.map((action) => {
    const destructive = action.destructive || DESTRUCTIVE_TYPES.has(action.type);
    const requiresApproval = destructive || action.requires_approval;
    return {
      ...action,
      destructive,
      requires_approval: requiresApproval,
      approved: requiresApproval ? false : action.approved ?? true,
    };
  });
}

export function approvedActions(actions: ProposedAction[]): ProposedAction[] {
  return actions.filter((action) => !action.requires_approval || action.approved === true);
}

