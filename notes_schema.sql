/**
 * NOTES TABLE SCHEMA
 * Run this in your Supabase SQL Editor to create the notes table.
 */

create table notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  content text not null,
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table notes enable row level security;

-- Policies
create policy "Users can view their own notes" on notes
  for select using (auth.uid() = user_id);

create policy "Users can insert their own notes" on notes
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own notes" on notes
  for update using (auth.uid() = user_id);

create policy "Users can delete their own notes" on notes
  for delete using (auth.uid() = user_id);
