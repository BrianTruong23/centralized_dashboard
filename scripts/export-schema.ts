#!/usr/bin/env ts-node
/**
 * Export Supabase database schema to Markdown
 *
 * This script connects to a Supabase Postgres database and exports:
 * - All tables with their columns (name, type, nullable, default)
 * - RLS (Row Level Security) status per table
 * - All RLS policies with their details
 *
 * Usage:
 *   SUPABASE_DB_URL=postgresql://... npm run export-schema
 *   or
 *   ts-node scripts/export-schema.ts
 *
 * Environment variables:
 *   SUPABASE_DB_URL - PostgreSQL connection string (required)
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

interface Policy {
  name: string;
  command: string;
  roles: string[];
  using: string | null;
  withCheck: string | null;
}

interface Table {
  schema: string;
  name: string;
  rlsEnabled: boolean;
  rlsForced: boolean;
  columns: Column[];
  policies: Policy[];
}

// Schemas to include in the export
const INCLUDED_SCHEMAS = ['public', 'storage'];

// Schemas to exclude from the export
const EXCLUDED_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'];

async function connectToDatabase(): Promise<Client> {
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    console.error('❌ Error: SUPABASE_DB_URL environment variable is not set');
    console.error('\nPlease set it to your Supabase database connection string:');
    console.error('  export SUPABASE_DB_URL="postgresql://postgres:[YOUR-PASSWORD]@[PROJECT-REF].supabase.co:5432/postgres"');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: true
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to Supabase database');
    return client;
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
}

async function getSchemas(client: Client): Promise<string[]> {
  const query = `
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name = ANY($1::text[])
    ORDER BY schema_name;
  `;

  const result = await client.query(query, [INCLUDED_SCHEMAS]);
  return result.rows.map(row => row.schema_name);
}

async function getTables(client: Client, schema: string): Promise<{ name: string; rlsEnabled: boolean; rlsForced: boolean }[]> {
  const query = `
    SELECT
      c.relname AS name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relkind = 'r'
      AND NOT c.relispartition
    ORDER BY c.relname;
  `;

  const result = await client.query(query, [schema]);
  return result.rows.map(row => ({
    name: row.name,
    rlsEnabled: row.rls_enabled,
    rlsForced: row.rls_forced
  }));
}

async function getColumns(client: Client, schema: string, table: string): Promise<Column[]> {
  const query = `
    SELECT
      column_name AS name,
      CASE
        WHEN udt_name = 'int4' THEN 'integer'
        WHEN udt_name = 'int8' THEN 'bigint'
        WHEN udt_name = 'bool' THEN 'boolean'
        WHEN udt_name = 'timestamptz' THEN 'timestamp with time zone'
        ELSE udt_name
      END AS type,
      is_nullable = 'YES' AS nullable,
      column_default AS default_value
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
    ORDER BY ordinal_position;
  `;

  const result = await client.query(query, [schema, table]);
  return result.rows.map(row => ({
    name: row.name,
    type: row.type,
    nullable: row.nullable,
    default: row.default_value
  }));
}

async function getPolicies(client: Client, schema: string, table: string): Promise<Policy[]> {
  const query = `
    SELECT
      policyname AS name,
      cmd AS command,
      roles,
      qual AS using_expr,
      with_check AS with_check_expr
    FROM pg_policies
    WHERE schemaname = $1
      AND tablename = $2
    ORDER BY policyname;
  `;

  const result = await client.query(query, [schema, table]);
  return result.rows.map(row => ({
    name: row.name,
    command: row.command,
    roles: row.roles || [],
    using: row.using_expr,
    withCheck: row.with_check_expr
  }));
}

async function exportSchema(client: Client): Promise<Table[]> {
  const tables: Table[] = [];
  const schemas = await getSchemas(client);

  console.log(`\n📊 Exporting schema from ${schemas.length} schema(s): ${schemas.join(', ')}`);

  for (const schema of schemas) {
    const schemaTables = await getTables(client, schema);
    console.log(`  • ${schema}: ${schemaTables.length} table(s)`);

    for (const tableInfo of schemaTables) {
      const columns = await getColumns(client, schema, tableInfo.name);
      const policies = await getPolicies(client, schema, tableInfo.name);

      tables.push({
        schema,
        name: tableInfo.name,
        rlsEnabled: tableInfo.rlsEnabled,
        rlsForced: tableInfo.rlsForced,
        columns,
        policies
      });
    }
  }

  return tables;
}

function formatMarkdown(tables: Table[]): string {
  const timestamp = new Date().toISOString();
  const schemaCount = new Set(tables.map(t => t.schema)).size;
  const tableCount = tables.length;
  const policyCount = tables.reduce((sum, t) => sum + t.policies.length, 0);

  let md = `# Supabase Database Schema\n\n`;
  md += `> **Generated:** ${timestamp}\n`;
  md += `> **Auto-generated by:** \`scripts/export-schema.ts\`\n\n`;
  md += `## Summary\n\n`;
  md += `- **Schemas:** ${schemaCount}\n`;
  md += `- **Tables:** ${tableCount}\n`;
  md += `- **RLS Policies:** ${policyCount}\n\n`;
  md += `---\n\n`;

  // Group tables by schema
  const tablesBySchema = new Map<string, Table[]>();
  for (const table of tables) {
    if (!tablesBySchema.has(table.schema)) {
      tablesBySchema.set(table.schema, []);
    }
    tablesBySchema.get(table.schema)!.push(table);
  }

  // Sort schemas (public first, then alphabetically)
  const sortedSchemas = Array.from(tablesBySchema.keys()).sort((a, b) => {
    if (a === 'public') return -1;
    if (b === 'public') return 1;
    return a.localeCompare(b);
  });

  for (const schema of sortedSchemas) {
    const schemaTables = tablesBySchema.get(schema)!;
    md += `## Schema: \`${schema}\`\n\n`;
    md += `**Tables:** ${schemaTables.length}\n\n`;

    for (const table of schemaTables) {
      md += `### \`${schema}.${table.name}\`\n\n`;

      // RLS Status
      md += `**Row Level Security:**\n`;
      md += `- Enabled: ${table.rlsEnabled ? '✅ Yes' : '❌ No'}\n`;
      if (table.rlsEnabled) {
        md += `- Forced: ${table.rlsForced ? '✅ Yes' : '❌ No'}\n`;
      }
      md += `\n`;

      // Columns
      md += `**Columns:**\n\n`;
      md += `| Column | Type | Nullable | Default |\n`;
      md += `|--------|------|----------|----------|\n`;
      for (const col of table.columns) {
        const nullable = col.nullable ? '✓' : '✗';
        const defaultVal = col.default ? `\`${col.default}\`` : '-';
        md += `| \`${col.name}\` | \`${col.type}\` | ${nullable} | ${defaultVal} |\n`;
      }
      md += `\n`;

      // Policies
      if (table.policies.length > 0) {
        md += `**RLS Policies:**\n\n`;
        for (const policy of table.policies) {
          md += `#### ${policy.name}\n\n`;
          md += `- **Command:** \`${policy.command}\`\n`;
          md += `- **Roles:** ${policy.roles.map(r => `\`${r}\``).join(', ')}\n`;
          if (policy.using) {
            md += `- **USING:** \`${policy.using}\`\n`;
          }
          if (policy.withCheck) {
            md += `- **WITH CHECK:** \`${policy.withCheck}\`\n`;
          }
          md += `\n`;
        }
      } else if (table.rlsEnabled) {
        md += `**RLS Policies:** None defined\n\n`;
      }

      md += `---\n\n`;
    }
  }

  return md;
}

async function main() {
  console.log('🚀 Starting Supabase schema export...\n');

  const client = await connectToDatabase();

  try {
    const tables = await exportSchema(client);
    const markdown = formatMarkdown(tables);

    // Write to docs/SCHEMA.md
    const docsDir = path.join(__dirname, '..', 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
      console.log('📁 Created docs directory');
    }

    const outputPath = path.join(docsDir, 'SCHEMA.md');
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`\n✅ Schema exported successfully to: ${outputPath}`);
    console.log(`📊 Exported ${tables.length} tables with ${tables.reduce((sum, t) => sum + t.policies.length, 0)} policies\n`);
  } catch (error) {
    console.error('❌ Error exporting schema:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
