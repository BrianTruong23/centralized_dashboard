/**
 * ACTIVITY LOG TABLE SCHEMA
 * Run this in your Supabase SQL Editor to create the activity_log table.
 */

-- Create the activity_log table
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users,
  actor text not null check (actor in ('user', 'agent', 'system')),
  action_type text not null,
  entity_type text,
  entity_id uuid,
  summary text not null,
  metadata jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Create indexes for efficient querying
create index activity_log_user_id_created_at_idx on public.activity_log (user_id, created_at desc);
create index activity_log_user_id_action_type_idx on public.activity_log (user_id, action_type);
create index activity_log_metadata_idx on public.activity_log using gin (metadata);

-- Enable Row Level Security
alter table public.activity_log enable row level security;

-- RLS Policies
-- Users can view their own activity
create policy "Users can view their own activity" on public.activity_log
  for select using (auth.uid() = user_id);

-- Users can insert their own activity
create policy "Users can insert their own activity" on public.activity_log
  for insert with check (auth.uid() = user_id);

-- Disallow UPDATE and DELETE for MVP (activity is append-only)
-- If needed later, add policies for specific use cases

-- Optional: Add a comment for documentation
comment on table public.activity_log is 'Stores per-user activity feed for tasks, projects, and agent actions';
comment on column public.activity_log.actor is 'Who performed the action: user, agent, or system';
comment on column public.activity_log.action_type is 'Type of action (e.g., TASK_CREATED, TASK_COMPLETED, PLAN_GENERATED)';
comment on column public.activity_log.entity_type is 'Type of entity affected (e.g., task, project, note)';
comment on column public.activity_log.entity_id is 'UUID of the affected entity';
comment on column public.activity_log.summary is 'Human-readable summary of the activity';
comment on column public.activity_log.metadata is 'Additional context (changed fields, counts, etc.)';
