-- Agent Console schema (Supabase/Postgres)
-- Run this in Supabase SQL Editor.

begin;

-- 1) Tasks compatibility columns used by the Agent Console.
alter table public.tasks add column if not exists inbox boolean not null default false;
alter table public.tasks add column if not exists archived boolean not null default false;
alter table public.tasks add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());
alter table public.tasks add column if not exists completed_at timestamp with time zone;

create index if not exists idx_tasks_user_archived on public.tasks(user_id, archived);
create index if not exists idx_tasks_user_inbox on public.tasks(user_id, inbox);
create index if not exists idx_tasks_deadline on public.tasks(deadline);

-- 2) User preferences for planning/scheduling.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  work_hours jsonb default '{"start":"09:00","end":"17:00"}'::jsonb,
  timezone text default 'UTC',
  max_tasks_per_day integer default 5 check (max_tasks_per_day > 0),
  focus_blocks integer[] default '{90}',
  scheduling_style text default 'balanced',
  energy_peak text,
  planning_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users can view their own preferences" on public.user_preferences;
create policy "Users can view their own preferences"
  on public.user_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own preferences" on public.user_preferences;
create policy "Users can insert their own preferences"
  on public.user_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own preferences" on public.user_preferences;
create policy "Users can update their own preferences"
  on public.user_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Agent run history / proposal-execution records.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_text text not null,
  intent text not null,
  proposed_plan_json jsonb not null default '{}'::jsonb,
  approved_actions_json jsonb not null default '[]'::jsonb,
  executed_actions_json jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_agent_runs_user_created on public.agent_runs(user_id, created_at desc);

alter table public.agent_runs enable row level security;

drop policy if exists "Users can view their own agent runs" on public.agent_runs;
create policy "Users can view their own agent runs"
  on public.agent_runs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own agent runs" on public.agent_runs;
create policy "Users can insert their own agent runs"
  on public.agent_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own agent runs" on public.agent_runs;
create policy "Users can update their own agent runs"
  on public.agent_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4) Auditable per-action task activity.
create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  actor uuid references auth.users(id) on delete set null,
  action_type text not null,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_task_activity_task_created on public.task_activity(task_id, created_at desc);
create index if not exists idx_task_activity_actor_created on public.task_activity(actor, created_at desc);

alter table public.task_activity enable row level security;

drop policy if exists "Users can view own task activity" on public.task_activity;
create policy "Users can view own task activity"
  on public.task_activity for select
  using (
    actor = auth.uid()
    or exists (
      select 1
      from public.tasks t
      where t.id = task_activity.task_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert own task activity" on public.task_activity;
create policy "Users can insert own task activity"
  on public.task_activity for insert
  with check (
    actor = auth.uid()
    or actor is null
  );

commit;

