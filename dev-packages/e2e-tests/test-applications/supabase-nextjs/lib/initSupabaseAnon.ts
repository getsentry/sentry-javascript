import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// These are the default development keys for a local Supabase instance
const NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cGxvcmV0ZXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2';

export const getSupabaseClient = () => {
  const supabaseClient = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

  Sentry.instrumentSupabaseClient(supabaseClient);

  return supabaseClient;
};
