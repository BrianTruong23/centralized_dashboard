-- Create the activity_logs table
create table activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  action text not null, -- 'created_task', 'completed_task', 'updated_task', 'deleted_task'
  entity_id uuid not null, -- ID of the task or project
  entity_type text not null default 'task', -- 'task', 'project', etc.
  details jsonb, -- Snapshot of task title or changes
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Init RLS
alter table activity_logs enable row level security;

-- Policy: Users can only see their own logs
create policy "Users can view their own activity logs"
  on activity_logs for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own logs
create policy "Users can insert their own activity logs"
  on activity_logs for insert
  with check (auth.uid() = user_id);
