This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database Schema Documentation

This project uses Supabase PostgreSQL and automatically maintains schema documentation.

### Viewing the Schema

The current database schema is documented in [`docs/SCHEMA.md`](./docs/SCHEMA.md), which includes:
- All tables with their columns (name, type, nullable, default values)
- Row Level Security (RLS) status for each table
- All RLS policies with their rules

### Generating Schema Documentation Locally

To export the latest schema from your Supabase database:

1. **Set your database connection string:**
   ```bash
   export SUPABASE_DB_URL="postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres"
   ```

   You can find your connection details in the [Supabase Dashboard](https://supabase.com/dashboard) under:
   - Project Settings → Database → Connection String

2. **Run the export script:**
   ```bash
   npm run export-schema
   ```

   This will update `docs/SCHEMA.md` with the current database schema.

### Automated Schema Updates

The schema documentation is automatically updated via GitHub Actions:
- **On push to `main`** (when SQL files or the export script change)
- **On demand** via workflow dispatch
- **Nightly** at 2 AM UTC (scheduled)

The workflow only commits changes when the schema actually changes (no noisy commits).

### GitHub Secrets Required

For the automated workflow to function, ensure these secrets are configured in your repository:

- `SUPABASE_DB_URL` - Your Supabase PostgreSQL connection string (read-only recommended)

**To add secrets:**
1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add `SUPABASE_DB_URL` with your connection string

**Security Note:** Use a read-only database role for the GitHub Action to minimize security risks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
