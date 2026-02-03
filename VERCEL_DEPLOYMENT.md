# Vercel Deployment Guide

## Environment Variables Required

Set these in Vercel Dashboard → Settings → Environment Variables:

### Required for Supabase:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key

### Optional for GitHub Integration:
- `GITHUB_APIKEY` - GitHub personal access token (for syncing issues)
- `GITHUB_REPO` - Repository in format `owner/repo` (e.g., `facebook/react`)

## Common Issues Fixed

1. **Lockfile Warning**: Fixed by updating `next.config.ts`
2. **API Route Errors**: API routes now return 503 (Service Unavailable) instead of 500 when env vars are missing
3. **Build Configuration**: Added explicit build settings

## Deployment Steps

1. Push your code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Troubleshooting

If deployment fails:
1. Check build logs in Vercel dashboard
2. Verify all required environment variables are set
3. Ensure Supabase is configured correctly
4. Check that the `ideas` table exists in Supabase

## Notes

- GitHub integration will work only if `GITHUB_APIKEY` and `GITHUB_REPO` are set
- Supabase is required for the kanban board to work
- Tasks will fall back to local storage if Supabase is not configured
