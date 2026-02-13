# Enable Google Sign-In with Supabase

This project now supports Google OAuth via `supabase.auth.signInWithOAuth({ provider: 'google' })`.

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

## 5. Test the flow

1. Run the app.
2. Open auth modal.
3. Click `Continue with Google`.
4. Complete Google consent.
5. Confirm you are redirected back and logged in.

## Troubleshooting

- `redirect_uri_mismatch`: your Google OAuth redirect URI does not exactly match Supabase callback URL.
- Redirecting to wrong app URL: update `Site URL` and `Redirect URLs` in Supabase.
- Provider button returns error: verify Google provider is enabled and credentials are correct.
