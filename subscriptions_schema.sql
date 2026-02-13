/**
 * USER SUBSCRIPTIONS TABLE SCHEMA
 * Run this in your Supabase SQL Editor to create the subscriptions table.
 */

create table user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null unique,
  is_premium boolean default false,
  subscription_id text,
  subscription_status text,
  plan_id text,
  payment_provider text default 'paypal',
  subscription_start_date timestamp with time zone,
  subscription_end_date timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table user_subscriptions enable row level security;

-- Policies
create policy "Users can view their own subscription" on user_subscriptions
  for select using (auth.uid() = user_id);

create policy "Users can insert their own subscription" on user_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own subscription" on user_subscriptions
  for update using (auth.uid() = user_id);

-- Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger to automatically update updated_at
create trigger update_user_subscriptions_updated_at
  before update on user_subscriptions
  for each row
  execute function update_updated_at_column();

-- Create index for faster lookups
create index idx_user_subscriptions_user_id on user_subscriptions(user_id);
create index idx_user_subscriptions_subscription_id on user_subscriptions(subscription_id);
