/**
 * INTENT LABELS & GENTLE ACCOUNTABILITY MIGRATION
 * Add intent labels and postpone tracking to tasks table
 */

-- Add intent_label column (nullable, one of the 5 intent types)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS intent_label text
CHECK (intent_label IN ('Deep', 'Quick', 'Waiting', 'Errand', 'Message'));

-- Add postpone tracking columns
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS postpone_count integer DEFAULT 0;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS last_postponed_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN tasks.intent_label IS 'Task intent: Deep (focus work), Quick (short tasks), Waiting (blocked), Errand (outside tasks), Message (communication)';
COMMENT ON COLUMN tasks.postpone_count IS 'Number of times this task has been postponed';
COMMENT ON COLUMN tasks.last_postponed_at IS 'Timestamp of last postpone action';
