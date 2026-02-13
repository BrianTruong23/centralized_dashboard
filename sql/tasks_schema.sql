/**
 * TASKS TABLE SCHEMA
 * Run this in your Supabase SQL Editor to create the tasks table.
 */

create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  text text not null,
  description text,
  category text default 'Life',
  priority integer default 3,
  estimated_minutes integer default 60,
  energy_level text default 'medium',
  deadline timestamp with time zone,
  tags text[] default '{}',
  completed boolean default false,
  status text default 'todo',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table tasks enable row level security;

-- Policies
create policy "Users can view their own tasks" on tasks
  for select using (auth.uid() = user_id);

create policy "Users can insert their own tasks" on tasks
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own tasks" on tasks
  for update using (auth.uid() = user_id);

create policy "Users can delete their own tasks" on tasks
  for delete using (auth.uid() = user_id);

/**
 * MIGRATION: If you already have the tasks table without the status column,
 * run this instead:
 *
 *   ALTER TABLE tasks ADD COLUMN status text DEFAULT 'todo';
 *   UPDATE tasks SET status = CASE WHEN completed THEN 'done' ELSE 'todo' END;
 */
