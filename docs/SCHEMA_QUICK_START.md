# Schema Export - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Get Your Connection String
```bash
# From Supabase Dashboard:
# Project Settings → Database → Connection String → URI
```

### 2. Add GitHub Secret
```
Repository → Settings → Secrets and variables → Actions
Click "New repository secret"

Name:  SUPABASE_DB_URL
Value: postgresql://postgres:YOUR_PASSWORD@xyz.supabase.co:5432/postgres
```

### 3. Run the Workflow
```
Actions tab → "Update Schema Documentation" → Run workflow
```

That's it! ✅

---

## 📖 Common Commands

### Export Schema Locally
```bash
export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@PROJECT.supabase.co:5432/postgres"
npm run export-schema
```

### View Generated Schema
```bash
cat docs/SCHEMA.md
```

### Check Workflow Status
```
GitHub → Actions tab → "Update Schema Documentation"
```

---

## 🔧 Troubleshooting

### Connection Failed?
- ✅ Check your password is correct
- ✅ Verify project reference (xyz.supabase.co)
- ✅ Ensure Supabase project is active

### No Tables Found?
- ✅ Tables must be in `public` or `storage` schema
- ✅ Check database has tables created

### Workflow Not Running?
- ✅ Verify `SUPABASE_DB_URL` secret is set
- ✅ Check Actions are enabled in repo settings
- ✅ Ensure workflow file is in `.github/workflows/`

---

## 📚 Full Documentation

- **Setup Guide:** [`docs/SCHEMA_SETUP.md`](./SCHEMA_SETUP.md)
- **Implementation Details:** [`SCHEMA_EXPORT_IMPLEMENTATION.md`](../SCHEMA_EXPORT_IMPLEMENTATION.md)
- **Generated Schema:** [`docs/SCHEMA.md`](./SCHEMA.md)

---

## 🔒 Security Tip

For production, use a **read-only database user**:

```sql
CREATE ROLE schema_reader WITH LOGIN PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE postgres TO schema_reader;
GRANT USAGE ON SCHEMA public, storage TO schema_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public, storage TO schema_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA information_schema, pg_catalog TO schema_reader;
```

Then use:
```
postgresql://schema_reader:secure_password@xyz.supabase.co:5432/postgres
```

See [`SCHEMA_SETUP.md`](./SCHEMA_SETUP.md) for complete SQL script.

---

## 📅 When Does It Run?

The schema documentation updates automatically:
- ✅ When you push to `main` (if SQL files changed)
- ✅ Every night at 2 AM UTC
- ✅ When you manually trigger the workflow

---

## 🎯 What Gets Exported?

For each table:
- Column names, types, nullable, defaults
- RLS enabled/forced status
- All RLS policies with their rules

From schemas:
- `public` (your application tables)
- `storage` (Supabase storage tables)

---

Need help? Check the [full setup guide](./SCHEMA_SETUP.md).
