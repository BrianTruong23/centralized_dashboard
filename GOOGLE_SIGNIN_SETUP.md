# Google Sign-In Setup Guide

This guide explains how to set up and test Google Sign-In (OAuth) integration with Supabase.

## Prerequisites

1. A Supabase project with authentication enabled
2. Environment variables configured:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Setup Steps

### 1. Configure Google OAuth in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Providers**
3. Enable **Google** provider
4. Configure the OAuth credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google+ API
   - Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Set Application type to **Web application**
   - Add authorized redirect URIs:
     - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
     - `http://localhost:3000/auth/callback` (for local testing)
   - Copy the **Client ID** and **Client Secret**
5. Paste the credentials into Supabase Google provider settings
6. Save the configuration

### 2. Run Database Migrations

Execute the following SQL files in your Supabase SQL Editor (in order):

```sql
-- 1. Create profiles table with RLS policies
-- File: sql/profiles_schema.sql

-- 2. Create profile upsert trigger for OAuth users
-- File: sql/profile_upsert_trigger.sql
```

These migrations will:
- Create a `profiles` table to store user profile information
- Set up Row Level Security (RLS) policies
- Create a trigger that automatically creates/updates profiles when users sign in
- Handle duplicate account prevention (when Google email matches existing email/password account)

### 3. Verify Callback Route

The OAuth callback route is automatically available at:
- **Path**: `/auth/callback`
- **File**: `src/app/auth/callback/route.ts`

This route handles:
- Code exchange for session tokens
- Error handling (user cancelled, network issues, blocked popup)
- Redirect back to home page on success
- Error message display on failure

## Features Implemented

### 1. Google Sign-In Button

- Located in the Auth modal (`src/components/Auth.tsx`)
- Prominent "Continue with Google" button with Google logo
- Loading state during OAuth redirect
- Disabled state when processing

### 2. OAuth Flow

- **Sign-in**: `supabase.auth.signInWithOAuth({ provider: 'google' })`
- **Callback**: Exchanges authorization code for session
- **Session Persistence**: Automatically handled by Supabase client
- **Profile Creation**: Automatic via database trigger

### 3. Error Handling

The implementation handles all required error states:

#### User Cancelled
- User closes Google sign-in popup or clicks "Cancel"
- Error message: "User cancelled the sign-in flow"
- UI shows error in auth modal

#### Network Error
- Connection issues during OAuth flow
- Error message: "Network error occurred"
- UI shows error with retry option

#### Blocked Popup
- Browser blocks the OAuth popup window
- Error message: "Please allow popups for this site"
- User can retry after allowing popups

#### Configuration Error
- Missing Supabase credentials
- OAuth provider not enabled
- Clear error messages guide user to fix configuration

### 4. Profile Management

Profiles are automatically created/updated with:
- **Email**: User's email from OAuth provider
- **Full Name**: Extracted from `raw_user_meta_data.name` or `raw_user_meta_data.full_name`
- **Avatar URL**: User's profile picture from Google (`raw_user_meta_data.avatar_url`)
- **Timestamps**: `created_at` and `updated_at`

### 5. Duplicate Account Prevention

Supabase automatically handles account linking:
- If user signs up with email/password: `user@example.com`
- Then tries to sign in with Google using same email: `user@example.com`
- Supabase will:
  - Link the accounts if email is verified
  - Or show error if email not verified (prompting verification first)
- The profile trigger ensures profile data is updated with latest OAuth info

## Testing Checklist

### ✅ Basic Flow
- [ ] Click "Continue with Google" button
- [ ] Redirected to Google sign-in page
- [ ] Select Google account
- [ ] Grant permissions
- [ ] Redirected back to app
- [ ] Successfully signed in
- [ ] Profile created in database
- [ ] User email displayed in UI

### ✅ Profile Creation
- [ ] First login creates profile with name and avatar from Google
- [ ] Profile visible in Supabase Dashboard → Authentication → Users
- [ ] Profile data in `public.profiles` table
- [ ] Avatar URL saved if provided by Google

### ✅ Session Persistence
- [ ] Refresh page - user remains signed in
- [ ] Close and reopen browser - user remains signed in
- [ ] Session token stored in localStorage
- [ ] Token automatically refreshed when expired

### ✅ Error States

#### Test: User Cancels Sign-In
1. Click "Continue with Google"
2. Close the Google popup window immediately
3. **Expected**: Error message shown in auth modal
4. **Expected**: User can retry sign-in

#### Test: Network Error
1. Disconnect internet
2. Click "Continue with Google"
3. **Expected**: Error message about network issue
4. **Expected**: User can retry when connection restored

#### Test: Blocked Popup
1. Configure browser to block popups
2. Click "Continue with Google"
3. **Expected**: Error about blocked popup
4. **Expected**: Instructions to allow popups
5. Allow popups and retry
6. **Expected**: OAuth flow works

#### Test: Invalid Configuration
1. Remove `NEXT_PUBLIC_SUPABASE_URL` from `.env.local`
2. Restart dev server
3. Click "Continue with Google"
4. **Expected**: Configuration error message

### ✅ Duplicate Account Prevention
- [ ] Create account with email/password: `test@example.com`
- [ ] Sign out
- [ ] Click "Continue with Google"
- [ ] Sign in with Google account: `test@example.com`
- [ ] **Expected**: Supabase links accounts OR prompts email verification
- [ ] **Expected**: Profile updated with Google data (name/avatar)
- [ ] **Expected**: No duplicate user entries in database

### ✅ Sign Out
- [ ] Click "Log Out" button
- [ ] User signed out successfully
- [ ] Session cleared from localStorage
- [ ] Redirected to auth modal

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Add your Supabase credentials

# 3. Run development server
npm run dev

# 4. Open browser
open http://localhost:3000
```

## Troubleshooting

### Issue: "Invalid redirect URI"
- **Solution**: Add your callback URL to Google Cloud Console authorized redirect URIs
- Format: `http://localhost:3000/auth/callback` for local dev

### Issue: "Access blocked: This app's request is invalid"
- **Solution**: Verify Google OAuth is enabled in Supabase
- **Solution**: Check Client ID and Secret are correctly configured

### Issue: "Error: PKCE required"
- **Solution**: This is handled automatically by Supabase
- If persists, update `@supabase/supabase-js` to latest version

### Issue: Profile not created
- **Solution**: Run the profile trigger SQL migration
- **Solution**: Check Supabase logs for trigger errors
- **Solution**: Verify RLS policies allow inserts

### Issue: Duplicate accounts created
- **Solution**: Supabase should prevent this automatically
- Check that both accounts have same verified email
- Manually merge accounts in Supabase Dashboard if needed

## Security Considerations

1. **RLS Policies**: Users can only access their own profile
2. **HTTPS**: Always use HTTPS in production (handled by Vercel/Supabase)
3. **Token Storage**: Access tokens stored securely by Supabase client
4. **PKCE Flow**: Proof Key for Code Exchange enabled by default
5. **State Parameter**: CSRF protection included in OAuth flow

## Production Deployment

Before deploying to production:

1. Update Google OAuth redirect URIs:
   - Add production domain: `https://yourdomain.com/auth/callback`
   - Remove localhost URLs (or keep for testing)

2. Verify environment variables in deployment platform:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Test OAuth flow in production environment

4. Monitor Supabase logs for any errors

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Next.js App Router Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
