import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your-supabase-url-placeholder'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-supabase-anon-key-placeholder'

if (supabaseUrl === 'your-supabase-url-placeholder' || supabaseAnonKey === 'your-supabase-anon-key-placeholder') {
  console.warn('Supabase URL or Anon Key is not set. Please provide them in your environment variables or replace placeholders.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
