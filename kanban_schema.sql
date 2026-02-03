create table ideas (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  description text,
  status text check (status in ('backlog', 'planned', 'in-progress', 'done')) default 'backlog',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table ideas enable row level security;

create policy "Users can view their own ideas" on ideas
  for select using (auth.uid() = user_id);

create policy "Users can insert their own ideas" on ideas
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own ideas" on ideas
  for update using (auth.uid() = user_id);

create policy "Users can delete their own ideas" on ideas
  for delete using (auth.uid() = user_id);
