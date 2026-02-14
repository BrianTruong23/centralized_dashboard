-- Onboarding status and preferences table
create table if not exists onboarding_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  completed boolean default false,
  completed_at timestamp with time zone,
  week_starts_monday boolean default true,
  max_tasks_per_day integer default 8,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(user_id)
);

-- Enable RLS
alter table onboarding_status enable row level security;

-- Policies
create policy "Users can view their own onboarding status"
  on onboarding_status for select
  using (auth.uid() = user_id);

create policy "Users can insert their own onboarding status"
  on onboarding_status for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own onboarding status"
  on onboarding_status for update
  using (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists idx_onboarding_user_id on onboarding_status(user_id);

-- Function to update the updated_at timestamp
create or replace function update_onboarding_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at
create trigger update_onboarding_updated_at
  before update on onboarding_status
  for each row
  execute function update_onboarding_updated_at();
