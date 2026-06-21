import { createClient } from '@supabase/supabase-js';

// Retrieve Supabase environment variables used by the browser client.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Track whether Supabase is properly configured
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[SpellSift] Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are missing.\n' +
    'This frontend cannot use a raw Postgres connection string directly. Add the Supabase project URL and anon key to your .env file.'
  );
}

// Create a singleton client instance — use a placeholder URL if none provided
// to avoid crashing the app. All API calls will fail gracefully.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
export default supabase;
