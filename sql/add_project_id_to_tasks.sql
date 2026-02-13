-- Add project_id column to tasks table
-- This links tasks to projects

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

-- Create an index for faster project-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- Note: No RLS policy changes needed — existing user_id policies cover this
