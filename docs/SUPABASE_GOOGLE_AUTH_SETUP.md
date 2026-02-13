# Enable Google Sign-In with Supabase

This project now supports Google OAuth via `supabase.auth.signInWithOAuth({ provider: 'google' })`.

## What the app needs

For Google sign-in to work in this app, you only need:

1. Supabase project with Auth enabled.
2. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
3. Google provider enabled in Supabase Auth settings.
4. Correct Supabase Auth URLs (`Site URL` + `Redirect URLs`) matching your app URLs.

No backend API route and no Google client SDK is required in this repo. OAuth is handled by Supabase.

## 1. Create Google OAuth credentials

1. Open Google Cloud Console: `APIs & Services` -> `Credentials`.
2. Click `Create Credentials` -> `OAuth client ID`.
3. Application type: `Web application`.
4. Add your Supabase callback URL as an Authorized redirect URI:
   - `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
5. Create the credential and copy:
   - `Client ID`
   - `Client Secret`

## 2. Enable Google provider in Supabase

1. Open Supabase Dashboard -> `Authentication` -> `Providers`.
2. Select `Google`.
3. Toggle `Enable sign in with Google`.
4. Paste your Google `Client ID` and `Client Secret`.
5. Save.

## 3. Configure Auth URLs in Supabase

In Supabase Dashboard -> `Authentication` -> `URL Configuration`:

1. Set `Site URL` to your app URL:
   - Local: `http://localhost:3000`
   - Production: `https://your-domain.com`
2. Add `Redirect URLs` for environments you use, for example:
   - `http://localhost:3000`
   - `https://your-domain.com`

## 4. Verify env vars in this app

Ensure `.env.local` has:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

No extra Google env vars are required in this app because OAuth is managed by Supabase.

## 5. Where this is wired in the app

Google sign-in is triggered from:

- `src/components/AuthModal.tsx`
- `src/components/Auth.tsx`

Both call:

```ts
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: window.location.origin },
})
```

After Google consent, Supabase redirects back to your app URL. Auth state is then handled by the existing Supabase session listeners in this codebase.

## 6. Test the flow

1. Run the app.
2. Open auth modal.
3. Click `Continue with Google`.
4. Complete Google consent.
5. Confirm you are redirected back and logged in.

## Troubleshooting

- `redirect_uri_mismatch`: your Google OAuth redirect URI does not exactly match Supabase callback URL.
- Redirecting to wrong app URL: update `Site URL` and `Redirect URLs` in Supabase.
- Provider button returns error: verify Google provider is enabled and credentials are correct.
