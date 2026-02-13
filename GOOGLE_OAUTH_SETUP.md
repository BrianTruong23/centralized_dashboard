# Google OAuth Setup Guide

This guide walks you through enabling "Continue with Google" in your app using Supabase Auth.

---

## Prerequisites

- Supabase project created
- App deployed (or using localhost for testing)
- Google Cloud Console access

---

## Step 1: Configure Google OAuth Provider in Supabase

### 1.1 Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Configure:
   - **Name**: `Minima Auth` (or your app name)
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://yourdomain.com
     ```
   - **Authorized redirect URIs**:
     ```
     https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
     http://localhost:3000/auth/callback
     https://yourdomain.com/auth/callback
     ```
     Replace `<your-supabase-project-ref>` with your actual Supabase project reference (found in Supabase Dashboard → Settings → API)

7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### 1.2 Add Credentials to Supabase

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **Google** in the list
5. Toggle **Enable Sign in with Google**
6. Paste:
   - **Client ID** (from Google Console)
   - **Client Secret** (from Google Console)
7. Click **Save**

---

## Step 2: Configure Redirect URLs

### 2.1 Add Site URL

1. In Supabase Dashboard → **Authentication** → **URL Configuration**
2. Set **Site URL** to:
   - Development: `http://localhost:3000`
   - Production: `https://yourdomain.com`

### 2.2 Add Redirect URLs (Optional)

If you want to support multiple redirect URLs:

1. In **Redirect URLs** section, add:
   ```
   http://localhost:3000/**
   https://yourdomain.com/**
   ```

---

## Step 3: Environment Variables

Ensure your `.env.local` file contains:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

No additional environment variables needed for Google OAuth.

---

## Step 4: Email Configuration (Optional)

### Disable Email Confirmation (for faster testing)

If you want Google sign-ins to be instant without email confirmation:

1. Go to **Authentication** → **Providers** → **Email**
2. Toggle **OFF** the option **Confirm email**
3. Click **Save**

**Note**: This also affects email/password sign-ups. For production, consider leaving email confirmation **enabled** and using Supabase's [custom email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

---

## Step 5: Test the Integration

### 5.1 Local Testing

1. Start your dev server:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000`
3. Click **Log In / Sign Up**
4. Click **Continue with Google**
5. Authorize with your Google account
6. You should be redirected back to `http://localhost:3000` and logged in

### 5.2 Verify User Data

After signing in with Google, check the user object in your app:

```tsx
console.log(user.user_metadata);
```

You should see:
```json
{
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "email": "user@example.com",
  "email_verified": true,
  "full_name": "John Doe",
  "name": "John Doe",
  "picture": "https://lh3.googleusercontent.com/...",
  "provider_id": "1234567890",
  "sub": "1234567890"
}
```

---

## Step 6: Account Linking (Automatic)

Supabase **automatically links** Google and email/password accounts if they share the same email.

### Example Flow:

1. User signs up with `john@example.com` + password
2. Later, user clicks "Continue with Google" using `john@example.com`
3. Supabase recognizes the email and **merges** the accounts
4. User now has **two identities** (email + google) under one account

### Verify Linking:

In Supabase Dashboard:
1. Go to **Authentication** → **Users**
2. Find the user
3. Click on their email
4. Check **Identities** section — you should see both `email` and `google` providers

---

## Step 7: Production Deployment

### 7.1 Update Google Console

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Edit your OAuth client
3. Add production URLs to:
   - **Authorized JavaScript origins**: `https://yourdomain.com`
   - **Authorized redirect URIs**: `https://yourdomain.com/auth/callback`

### 7.2 Update Supabase

1. Go to Supabase Dashboard → **Authentication** → **URL Configuration**
2. Update **Site URL** to `https://yourdomain.com`

### 7.3 Deploy

Deploy your app to Vercel/Netlify/etc. and test the flow in production.

---

## Troubleshooting

### Error: "Pop-ups are blocked"

**Solution**: User needs to enable pop-ups for your site. The error message already instructs them.

### Error: "redirect_uri_mismatch"

**Solution**: Ensure the redirect URI in Google Console **exactly matches** the Supabase callback URL:
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

### Error: "Invalid OAuth client"

**Solution**: Double-check that:
1. Client ID and Secret are correct in Supabase
2. Google OAuth client is **not restricted** to specific domains (or your domain is whitelisted)

### User cancelled Google sign-in

This is normal. The app shows: *"You cancelled Google sign-in. Please try again or use email/password."*

### Account not auto-linking

**Cause**: Emails don't match (e.g., signed up with `work@company.com`, but Google uses `personal@gmail.com`)

**Solution**: This is expected. Supabase only auto-links accounts with **matching emails**. Different emails = separate accounts.

---

## Optional: Profiles Table Setup

If you want to store additional user data (beyond `user_metadata`), create a `profiles` table:

```sql
-- Create profiles table
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create/update profile on sign-up/sign-in
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();
```

**Note**: Your current app uses `user_metadata` (no profiles table needed). Only add this if you need extra fields.

---

## Security Considerations

1. **Never expose Client Secret** in client-side code (it's only used in Supabase Dashboard)
2. **Use HTTPS in production** (required by Google OAuth)
3. **Enable email confirmation** for production (prevents abuse)
4. **Review Google OAuth scopes** (default is email + profile, which is safe)

---

## Success Checklist

- [ ] Google OAuth provider enabled in Supabase
- [ ] Client ID and Secret added to Supabase
- [ ] Redirect URLs configured in Google Console
- [ ] Site URL set in Supabase
- [ ] Local testing successful
- [ ] Account linking verified (same email → one account)
- [ ] Production URLs added (if deploying)

---

You're all set! Users can now sign in with Google. 🎉
