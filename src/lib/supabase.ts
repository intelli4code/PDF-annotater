import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mock-supabase-url'
const supabaseAnonKey = 'mock-supabase-anon-key'

if (supabaseUrl === 'your-supabase-url-placeholder' || supabaseAnonKey === 'your-supabase-anon-key-placeholder') {
  console.warn('Supabase URL or Anon Key is not set. Please provide them in your environment variables or replace placeholders.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
