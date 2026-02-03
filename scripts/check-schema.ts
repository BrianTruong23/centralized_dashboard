#!/usr/bin/env node
/**
 * Check if kanban schema is applied on Supabase
 * Reads env vars from .env.local if available
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Simple .env.local parser
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  
  const content = readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        process.env[key.trim()] = value.trim();
      }
    }
  });
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function checkSchema() {
  console.log('🔍 Checking Supabase schema status...\n');

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Supabase not configured');
    console.log('   Missing environment variables:');
    if (!supabaseUrl) console.log('   - NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseKey) console.log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY');
    console.log('\n   Create a .env.local file with these variables.');
    console.log('   Get them from: https://supabase.com/dashboard/project/_/settings/api');
    return false;
  }

  console.log(`✅ Supabase configured`);
  console.log(`   URL: ${supabaseUrl.substring(0, 30)}...\n`);

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('🔍 Checking for "ideas" table...');
    
    // Try to query the ideas table
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Schema NOT applied: Table "ideas" does not exist\n');
        return false;
      }
      if (error.code === 'PGRST301' || error.message.includes('permission denied')) {
        console.log('⚠️  Cannot verify: Permission denied');
        console.log('   This might mean the table exists but RLS is blocking access');
        console.log('   Or the table does not exist yet.\n');
        return null;
      }
      throw error;
    }

    console.log('✅ Schema IS applied: Table "ideas" exists and is accessible!');
    console.log(`   Found ${data?.length || 0} row(s) in the table\n`);
    return true;
  } catch (error: any) {
    console.error('❌ Error checking schema:', error.message);
    if (error.code) console.error(`   Error code: ${error.code}`);
    return false;
  }
}

checkSchema().then((result) => {
  if (result === false) {
    console.log('📝 To apply the schema:');
    console.log('   1. Go to: https://supabase.com/dashboard');
    console.log('   2. Select your project');
    console.log('   3. Navigate to: SQL Editor');
    console.log('   4. Copy and paste the SQL from kanban_schema.sql');
    console.log('   5. Click "Run"\n');
    process.exit(1);
  } else if (result === true) {
    process.exit(0);
  } else {
    process.exit(0);
  }
});
