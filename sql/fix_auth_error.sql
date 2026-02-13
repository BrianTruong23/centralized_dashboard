-- Drop the trigger if it exists
drop trigger if exists on_auth_user_created on auth.users;

-- Drop the function if it exists
drop function if exists public.handle_new_user();

-- Drop the profiles table if it exists (since you mentioned not needing it)
drop table if exists public.profiles;
