
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing Supabase environment variables. Storage will not persist to cloud.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
