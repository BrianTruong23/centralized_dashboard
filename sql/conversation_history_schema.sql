-- Conversation history storage for AI assistant threads
-- Each row is one conversation thread for one user.

create table if not exists public.conversation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Conversation',
  messages jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_history_user_updated
  on public.conversation_history(user_id, updated_at desc);

create index if not exists idx_conversation_history_user_created
  on public.conversation_history(user_id, created_at desc);

-- Keep updated_at current on row updates
create or replace function public.touch_conversation_history_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation_history_updated_at on public.conversation_history;
create trigger trg_touch_conversation_history_updated_at
before update on public.conversation_history
for each row execute function public.touch_conversation_history_updated_at();

alter table public.conversation_history enable row level security;

drop policy if exists "Users can view their own conversation history" on public.conversation_history;
create policy "Users can view their own conversation history"
  on public.conversation_history
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own conversation history" on public.conversation_history;
create policy "Users can insert their own conversation history"
  on public.conversation_history
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversation history" on public.conversation_history;
create policy "Users can update their own conversation history"
  on public.conversation_history
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversation history" on public.conversation_history;
create policy "Users can delete their own conversation history"
  on public.conversation_history
  for delete
  using (auth.uid() = user_id);
