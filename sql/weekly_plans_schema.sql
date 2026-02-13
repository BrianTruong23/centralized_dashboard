/**
 * WEEKLY PLANS SCHEMA
 * Run this in your Supabase SQL Editor to create the weekly_plans and activity_log tables.
 */

-- Weekly Plans table
create table weekly_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  date_range_start timestamp with time zone not null,
  date_range_end timestamp with time zone not null,
  goals text,
  constraints jsonb default '{}',
  status text default 'draft', -- draft, approved, discarded
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  approved_at timestamp with time zone,
  discarded_at timestamp with time zone
);

-- Weekly Plan Items table (links tasks to plans with suggested times)
create table weekly_plan_items (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references weekly_plans(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete cascade,
  title text not null,
  description text,
  category text,
  priority integer default 3,
  estimated_minutes integer default 60,
  energy_level text default 'medium',
  deadline timestamp with time zone,
  suggested_start timestamp with time zone,
  suggested_end timestamp with time zone,
  planning_metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Activity Log table
create table activity_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  actor text not null, -- 'user' or 'agent'
  action text not null, -- PLAN_GENERATED, PLAN_APPROVED, PLAN_DISCARDED, TASKS_CREATED_FROM_PLAN, TASK_UPDATED_FROM_PLAN_EDIT
  entity_type text, -- 'plan', 'task', etc.
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add new columns to tasks table for agent-generated tasks
alter table tasks add column if not exists source text default 'user';
alter table tasks add column if not exists suggested_start timestamp with time zone;
alter table tasks add column if not exists suggested_end timestamp with time zone;
alter table tasks add column if not exists planning_week_id uuid references weekly_plans(id) on delete set null;
alter table tasks add column if not exists planning_metadata jsonb default '{}';

-- Enable Row Level Security
alter table weekly_plans enable row level security;
alter table weekly_plan_items enable row level security;
alter table activity_log enable row level security;

-- Weekly Plans Policies
create policy "Users can view their own plans" on weekly_plans
  for select using (auth.uid() = user_id);

create policy "Users can insert their own plans" on weekly_plans
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own plans" on weekly_plans
  for update using (auth.uid() = user_id);

create policy "Users can delete their own plans" on weekly_plans
  for delete using (auth.uid() = user_id);

-- Weekly Plan Items Policies
create policy "Users can view their own plan items" on weekly_plan_items
  for select using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can insert their own plan items" on weekly_plan_items
  for insert with check (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can update their own plan items" on weekly_plan_items
  for update using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can delete their own plan items" on weekly_plan_items
  for delete using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

-- Activity Log Policies
create policy "Users can view their own activity log" on activity_log
  for select using (auth.uid() = user_id);

create policy "Users can insert their own activity log" on activity_log
  for insert with check (auth.uid() = user_id);

-- Indexes for performance
create index idx_weekly_plans_user_id on weekly_plans(user_id);
create index idx_weekly_plans_date_range on weekly_plans(date_range_start, date_range_end);
create index idx_weekly_plan_items_plan_id on weekly_plan_items(plan_id);
create index idx_weekly_plan_items_task_id on weekly_plan_items(task_id);
create index idx_activity_log_user_id on activity_log(user_id);
create index idx_activity_log_created_at on activity_log(created_at desc);
create index idx_tasks_source on tasks(source);
create index idx_tasks_planning_week_id on tasks(planning_week_id);
