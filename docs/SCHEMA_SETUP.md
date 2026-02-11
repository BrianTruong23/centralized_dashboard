# Database Schema Documentation Setup

This guide explains how to set up automated database schema documentation for this project.

## Overview

The schema documentation system automatically:
- Connects to your Supabase PostgreSQL database
- Exports all table structures, columns, and RLS policies
- Generates a readable Markdown file (`docs/SCHEMA.md`)
- Commits updates only when the schema changes

## Prerequisites

- A Supabase project with tables created
- Access to your Supabase project settings
- GitHub repository with Actions enabled

## Setup Steps

### 1. Get Your Supabase Connection String

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Project Settings** → **Database**
4. Scroll down to **Connection String** section
5. Select the **URI** tab
6. Copy the connection string (format: `postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres`)
7. Replace `[YOUR-PASSWORD]` with your actual database password

**Example:**
```
postgresql://postgres:your_password_here@abcdefghijklmnop.supabase.co:5432/postgres
```

### 2. Configure GitHub Secret

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Create a secret with:
   - **Name:** `SUPABASE_DB_URL`
   - **Value:** Your full connection string from step 1
5. Click **Add secret**

### 3. Test the Workflow

#### Option A: Manual Trigger
1. Go to **Actions** tab in your GitHub repository
2. Select **Update Schema Documentation** workflow
3. Click **Run workflow**
4. Select the `main` branch
5. Click **Run workflow**

#### Option B: Test Locally First
```bash
# Set the environment variable
export SUPABASE_DB_URL="postgresql://postgres:your_password@xyz.supabase.co:5432/postgres"

# Run the export script
npm run export-schema

# Check the generated file
cat docs/SCHEMA.md
```

### 4. Verify the Output

After running the workflow or script:
1. Check `docs/SCHEMA.md` for the generated documentation
2. Verify all expected tables are present
3. Confirm RLS policies are correctly documented

## Security Best Practices

### Use a Read-Only Database Role (Recommended)

For enhanced security, create a read-only database user for the schema export:

```sql
-- Run this in Supabase SQL Editor

-- Create a read-only role
CREATE ROLE schema_reader WITH LOGIN PASSWORD 'secure_password_here';

-- Grant connect privilege
GRANT CONNECT ON DATABASE postgres TO schema_reader;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public, storage TO schema_reader;

-- Grant SELECT on all tables in the schemas
GRANT SELECT ON ALL TABLES IN SCHEMA public, storage TO schema_reader;

-- Grant SELECT on system catalogs (needed for metadata queries)
GRANT SELECT ON ALL TABLES IN SCHEMA information_schema TO schema_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA pg_catalog TO schema_reader;

-- Ensure future tables are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public, storage
GRANT SELECT ON TABLES TO schema_reader;
```

Then use this connection string format:
```
postgresql://schema_reader:secure_password_here@[PROJECT-REF].supabase.co:5432/postgres
```

### Important Security Notes

- ✅ **DO:** Use a read-only database role for the GitHub Action
- ✅ **DO:** Store connection strings in GitHub Secrets (never in code)
- ✅ **DO:** Use SSL connections (automatically enabled for Supabase)
- ❌ **DON'T:** Commit database credentials to the repository
- ❌ **DON'T:** Use a superuser account for schema exports
- ❌ **DON'T:** Print connection strings in logs

## Workflow Triggers

The schema documentation updates automatically on:

1. **Push to `main`** - When SQL files or the export script change
2. **Manual trigger** - Via GitHub Actions workflow dispatch
3. **Scheduled** - Nightly at 2 AM UTC

## Troubleshooting

### Connection Failed

**Error:** `Failed to connect to database`

**Solutions:**
- Verify your connection string is correct
- Ensure the password doesn't contain special characters that need URL encoding
- Check that your Supabase project is running
- Verify network connectivity to Supabase

### No Tables Found

**Error:** Schema exported but no tables appear

**Solutions:**
- Verify tables exist in the `public` or `storage` schemas
- Check if tables are in a different schema (update `INCLUDED_SCHEMAS` in the script)
- Ensure the database user has SELECT permissions on the tables

### GitHub Action Fails

**Error:** Workflow fails with authentication error

**Solutions:**
- Verify the `SUPABASE_DB_URL` secret is set correctly
- Check for typos in the secret name
- Ensure the secret value doesn't have extra whitespace

### Permission Denied on Commit

**Error:** `permission denied to push`

**Solutions:**
- Ensure the repository has Actions permissions to write
- Go to Settings → Actions → General → Workflow permissions
- Select "Read and write permissions"
- Click Save

## Customization

### Change Output Location

Edit `scripts/export-schema.ts`:

```typescript
const outputPath = path.join(docsDir, 'SCHEMA.md');
// Change to your preferred location
```

### Include Different Schemas

Edit `scripts/export-schema.ts`:

```typescript
const INCLUDED_SCHEMAS = ['public', 'storage', 'your_schema'];
```

### Adjust Workflow Schedule

Edit `.github/workflows/update-schema-doc.yml`:

```yaml
schedule:
  - cron: '0 2 * * *'  # Change to your preferred schedule
```

## Expected Tables

Based on this project, you should see these tables in the exported schema:

- `public.projects` - User projects
- `public.tasks` - User tasks
- `public.notes` - User notes
- `public.ideas` - User ideas

Each should have:
- RLS enabled
- Policies for view/insert/update/delete based on `user_id`
- `USING` clause: `(auth.uid() = user_id)`

## Support

If you encounter issues:
1. Check the [GitHub Actions logs](../../actions) for detailed error messages
2. Test the script locally with `npm run export-schema`
3. Verify your Supabase connection string is correct
4. Review the [Supabase documentation](https://supabase.com/docs)

## Files Created

This setup includes:

- `scripts/export-schema.ts` - TypeScript script to export schema
- `.github/workflows/update-schema-doc.yml` - GitHub Action workflow
- `docs/SCHEMA.md` - Generated schema documentation (auto-updated)
- `docs/SCHEMA_SETUP.md` - This setup guide
