#!/usr/bin/env ts-node

/**
 * Check backlog items to see what #2 is
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
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

async function checkBacklog() {
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Supabase not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get session to find user_id
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    console.log('❌ Not authenticated. Please log in first.');
    return;
  }

  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('status', 'backlog')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`\n📋 Backlog Items (${data.length} total):\n`);
  data.forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`);
    if (item.description) {
      console.log(`   ${item.description.substring(0, 100)}...`);
    }
    console.log(`   ID: ${item.id}\n`);
  });

  if (data.length >= 2) {
    console.log(`\n✅ Item #2: "${data[1].title}"`);
    console.log(`   Description: ${data[1].description || 'No description'}`);
    console.log(`   ID: ${data[1].id}`);
  } else {
    console.log('\n⚠️  Less than 2 items in backlog');
  }
}

checkBacklog().catch(console.error);
