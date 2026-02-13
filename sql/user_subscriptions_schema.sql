-- Tracks user premium status from payment providers (PayPal in this project)
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'canceled', 'past_due')),
  provider text,
  provider_subscription_id text,
  plan_type text not null default 'one_time' check (plan_type in ('one_time', 'subscription')),
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_tier on public.user_subscriptions(tier);

create or replace function public.touch_user_subscriptions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.touch_user_subscriptions_updated_at();

alter table public.user_subscriptions enable row level security;

drop policy if exists "user can read own subscription" on public.user_subscriptions;
create policy "user can read own subscription"
  on public.user_subscriptions
  for select
  using (auth.uid() = user_id);
