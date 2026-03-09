create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  status text not null check (status in ('connected', 'error')),
  scope text not null default '',
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_type text,
  access_token_expires_at timestamptz,
  provider_account_email text,
  provider_account_id text,
  calendar_timezone text,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists idx_calendar_connections_user_provider
  on public.calendar_connections(user_id, provider);

create or replace function public.set_calendar_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calendar_connections_updated_at on public.calendar_connections;
create trigger trg_calendar_connections_updated_at
before update on public.calendar_connections
for each row execute function public.set_calendar_connections_updated_at();

alter table public.calendar_connections enable row level security;

drop policy if exists "calendar_connections_no_direct_select" on public.calendar_connections;
drop policy if exists "calendar_connections_select_own" on public.calendar_connections;
create policy "calendar_connections_select_own"
  on public.calendar_connections for select
  using (auth.uid() = user_id);

drop policy if exists "calendar_connections_no_direct_insert" on public.calendar_connections;
drop policy if exists "calendar_connections_insert_own" on public.calendar_connections;
create policy "calendar_connections_insert_own"
  on public.calendar_connections for insert
  with check (auth.uid() = user_id);

drop policy if exists "calendar_connections_no_direct_update" on public.calendar_connections;
drop policy if exists "calendar_connections_update_own" on public.calendar_connections;
create policy "calendar_connections_update_own"
  on public.calendar_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "calendar_connections_no_direct_delete" on public.calendar_connections;
drop policy if exists "calendar_connections_delete_own" on public.calendar_connections;
create policy "calendar_connections_delete_own"
  on public.calendar_connections for delete
  using (auth.uid() = user_id);
