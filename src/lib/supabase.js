import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('tu-proyecto') || supabaseAnonKey.includes('tu-anon-key')) {
  console.warn(
    'Supabase credentials are not configured. Please edit the .env.local file in the project root with your Supabase URL and Anon Key.'
  )
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder')
