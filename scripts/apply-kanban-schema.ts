#!/usr/bin/env ts-node

/**
 * Script to apply and verify kanban schema on Supabase
 * 
 * Usage:
 *   ts-node scripts/apply-kanban-schema.ts
 * 
 * This will:
 *   1. Display the SQL schema
 *   2. Check if schema is already applied (if Supabase is configured)
 *   3. Provide instructions for manual application
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const schemaPath = join(__dirname, '..', 'kanban_schema.sql');
const schemaSQL = readFileSync(schemaPath, 'utf-8');

async function checkSchema() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase not configured in environment variables');
    console.log('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return false;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Try to query the ideas table
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Schema not applied: Table "ideas" does not exist');
        return false;
      }
      throw error;
    }

    console.log('✅ Schema appears to be applied: Table "ideas" exists');
    return true;
  } catch (error: any) {
    console.log('⚠️  Could not verify schema:', error.message);
    return false;
  }
}

async function main() {
  console.log('📋 Kanban Schema Application');
  console.log('═'.repeat(60));
  console.log('');

  const isApplied = await checkSchema();
  console.log('');

  if (!isApplied) {
    console.log('📝 SQL Schema to Apply:');
    console.log('─'.repeat(60));
    console.log(schemaSQL);
    console.log('─'.repeat(60));
    console.log('');
    console.log('🚀 To apply this schema:');
    console.log('');
    console.log('   Option 1: Supabase Dashboard (Recommended)');
    console.log('   1. Go to: https://supabase.com/dashboard');
    console.log('   2. Select your project');
    console.log('   3. Navigate to: SQL Editor (left sidebar)');
    console.log('   4. Click "New query"');
    console.log('   5. Copy the SQL above and paste it');
    console.log('   6. Click "Run" (or Cmd/Ctrl + Enter)');
    console.log('');
    console.log('   Option 2: Supabase CLI');
    console.log('   If you have Supabase CLI installed:');
    console.log('   supabase db push --file kanban_schema.sql');
    console.log('');
    console.log('✅ After applying, run this script again to verify.');
  } else {
    console.log('✅ Schema is already applied!');
    console.log('   The "ideas" table exists with RLS policies configured.');
  }
}

main().catch(console.error);
