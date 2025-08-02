import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zfohraoldbaubkrjppec.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpmb2hyYW9sZGJhdWJrcmpwcGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODI0NzMsImV4cCI6MjA2OTU1ODQ3M30.CrCKNy0UEGmfaAvveKbI72IadyU9xQi3D91BlMGomy4'

let supabase: SupabaseClient | null = null;

if (supabaseUrl !== 'your-supabase-url-placeholder' && supabaseAnonKey !== 'your-supabase-anon-key-placeholder') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase URL or Anon Key is not set. PDF upload and delete functionality will be disabled. Please provide them in src/lib/supabase.ts');
}

export { supabase };
