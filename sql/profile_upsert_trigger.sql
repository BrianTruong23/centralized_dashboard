-- Function to handle profile upsert on user creation or sign-in
-- This ensures profiles are created/updated for OAuth users (Google, etc.)
-- and prevents duplicate accounts when Google email matches existing email/password account
create or replace function public.handle_user_profile()
returns trigger as $$
declare
  user_email text;
  user_full_name text;
  user_avatar_url text;
begin
  -- Extract user metadata
  user_email := new.email;
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(user_email, '@', 1)
  );
  user_avatar_url := new.raw_user_meta_data->>'avatar_url';

  -- Upsert profile (insert or update if exists)
  insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    user_email,
    user_full_name,
    user_avatar_url,
    now(),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

-- Create trigger on auth.users table
-- This fires after insert or update on the users table
drop trigger if exists on_auth_user_profile on auth.users;
create trigger on_auth_user_profile
  after insert or update on auth.users
  for each row
  execute function public.handle_user_profile();

-- Note: Supabase handles duplicate account prevention at the auth level.
-- When a user tries to sign in with Google using an email that already exists
-- via email/password, Supabase will automatically link the accounts if the
-- email is verified. This trigger ensures the profile is properly updated
-- with the latest information from the OAuth provider.
