#!/usr/bin/env node
/**
 * Display the kanban schema SQL for manual application
 */

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'kanban_schema.sql');
const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

console.log('📋 Kanban Schema SQL');
console.log('═'.repeat(60));
console.log(schemaSQL);
console.log('═'.repeat(60));
console.log('');
console.log('📝 To apply this schema:');
console.log('');
console.log('   1. Go to: https://supabase.com/dashboard');
console.log('   2. Select your project');
console.log('   3. Navigate to: SQL Editor (left sidebar)');
console.log('   4. Click "New query"');
console.log('   5. Copy the SQL above and paste it');
console.log('   6. Click "Run" (or Cmd/Ctrl + Enter)');
console.log('');
console.log('✅ After applying, the "ideas" table will be created with RLS policies.');
