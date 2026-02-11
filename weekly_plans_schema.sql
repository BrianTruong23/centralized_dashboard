/**
 * WEEKLY PLANS SCHEMA
 * Run this in your Supabase SQL Editor to create the weekly plans tables.
 */

-- Weekly Plans Table
create table weekly_plans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  goals text,
  constraints jsonb default '{}',
  start_date date not null,
  end_date date not null,
  status text default 'draft', -- draft, approved, discarded
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Weekly Plan Items Table (links tasks to plans with suggested times)
create table weekly_plan_items (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references weekly_plans(id) on delete cascade not null,
  task_id uuid references tasks(id) on delete cascade,
  title text not null,
  description text,
  category text,
  priority integer,
  estimated_minutes integer,
  energy_level text,
  suggested_start timestamptz,
  suggested_end timestamptz,
  day_of_week integer, -- 0=Sunday, 1=Monday, etc.
  sequence_order integer, -- Order within the plan
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table weekly_plans enable row level security;
alter table weekly_plan_items enable row level security;

-- Policies for weekly_plans
create policy "Users can view their own weekly plans" on weekly_plans
  for select using (auth.uid() = user_id);

create policy "Users can insert their own weekly plans" on weekly_plans
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own weekly plans" on weekly_plans
  for update using (auth.uid() = user_id);

create policy "Users can delete their own weekly plans" on weekly_plans
  for delete using (auth.uid() = user_id);

-- Policies for weekly_plan_items
create policy "Users can view their own weekly plan items" on weekly_plan_items
  for select using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can insert their own weekly plan items" on weekly_plan_items
  for insert with check (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can update their own weekly plan items" on weekly_plan_items
  for update using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can delete their own weekly plan items" on weekly_plan_items
  for delete using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = weekly_plan_items.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

/**
 * MIGRATION: Update tasks table to support planning fields
 * Run this to add new fields to the existing tasks table:
 */
alter table tasks add column if not exists source text default 'user';
alter table tasks add column if not exists suggested_start timestamptz;
alter table tasks add column if not exists suggested_end timestamptz;
alter table tasks add column if not exists planning_week_id uuid references weekly_plans(id) on delete set null;
alter table tasks add column if not exists planning_metadata jsonb;

-- Create index for efficient queries
create index if not exists idx_tasks_planning_week_id on tasks(planning_week_id);
create index if not exists idx_weekly_plan_items_plan_id on weekly_plan_items(plan_id);
create index if not exists idx_weekly_plan_items_task_id on weekly_plan_items(task_id);

/**
 * ACTIVITY LOG TABLE
 * Track plan-related events for auditing and analytics
 */
create table plan_activities (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- PLAN_GENERATED, PLAN_APPROVED, PLAN_DISCARDED, etc.
  actor text not null, -- user or agent
  plan_id uuid references weekly_plans(id) on delete cascade,
  task_count integer,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table plan_activities enable row level security;

-- Policies for plan_activities
create policy "Users can view their own plan activities" on plan_activities
  for select using (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = plan_activities.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create policy "Users can insert their own plan activities" on plan_activities
  for insert with check (
    exists (
      select 1 from weekly_plans
      where weekly_plans.id = plan_activities.plan_id
      and weekly_plans.user_id = auth.uid()
    )
  );

create index if not exists idx_plan_activities_plan_id on plan_activities(plan_id);
create index if not exists idx_plan_activities_created_at on plan_activities(created_at desc);
