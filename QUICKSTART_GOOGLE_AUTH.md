# Quick Start: Enable Google Sign-In

Follow these steps to enable "Continue with Google" in your app.

---

## Prerequisites

- [ ] Supabase project exists
- [ ] App runs locally (`npm run dev`)
- [ ] Google account for testing

---

## Step 1: Get Google OAuth Credentials (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project (or select existing)
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Choose **Web application**
6. Add these URLs:

**Authorized JavaScript origins:**
```
http://localhost:3000
```

**Authorized redirect URIs:**
```
https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback
http://localhost:3000/auth/callback
```

Find your Supabase project ref in: Supabase Dashboard → Settings → API → Project URL
Example: `abcdefghijklmnop.supabase.co`

7. Copy **Client ID** and **Client Secret**

---

## Step 2: Configure Supabase (2 minutes)

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Authentication** → **Providers**
4. Find **Google** and toggle it **ON**
5. Paste **Client ID** and **Client Secret**
6. Click **Save**

---

## Step 3: Set Site URL (1 minute)

1. In Supabase Dashboard → **Authentication** → **URL Configuration**
2. Set **Site URL** to:
   ```
   http://localhost:3000
   ```
3. Click **Save**

---

## Step 4: Test It (2 minutes)

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Go to `http://localhost:3000`

3. Click **Log In / Sign Up**

4. Click **Continue with Google**

5. Authorize with your Google account

6. You should be redirected back to your app and logged in!

---

## Verify It Worked

After signing in, open your browser console:

```tsx
console.log(user.user_metadata);
```

You should see:
```json
{
  "full_name": "Your Name",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "email": "you@gmail.com",
  "email_verified": true
}
```

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Fix:** Double-check that the redirect URI in Google Console **exactly matches**:
```
https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback
```

### Error: "Pop-ups are blocked"

**Fix:** Enable popups for localhost in your browser settings.

### Error: "Invalid OAuth client"

**Fix:** Verify Client ID and Secret in Supabase match Google Console.

### Sign-in works but user is not showing

**Fix:** Check browser console for errors. Ensure `onAuthStateChange` is listening.

---

## Next: Deploy to Production

1. Add production URLs to Google Console:
   - **Authorized JavaScript origins**: `https://yourdomain.com`
   - **Authorized redirect URIs**: `https://yourdomain.com/auth/callback`

2. Update Supabase **Site URL** to `https://yourdomain.com`

3. Deploy your app

4. Test Google sign-in in production

---

## Need More Details?

See `GOOGLE_OAUTH_SETUP.md` for:
- Account linking explanation
- Optional profiles table setup
- Security considerations
- Advanced configuration

---

**Total Time**: ~10 minutes
**Difficulty**: Easy

✅ You're done! Users can now sign in with Google.
