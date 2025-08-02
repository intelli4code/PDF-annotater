import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = 'your-supabase-url-placeholder'
const supabaseAnonKey = 'your-supabase-anon-key-placeholder'

let supabase: SupabaseClient | null = null;

if (supabaseUrl !== 'your-supabase-url-placeholder' && supabaseAnonKey !== 'your-supabase-anon-key-placeholder') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase URL or Anon Key is not set. PDF upload and delete functionality will be disabled. Please provide them in src/lib/supabase.ts');
}

export { supabase };
