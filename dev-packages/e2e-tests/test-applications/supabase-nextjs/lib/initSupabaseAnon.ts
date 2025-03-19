import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { supabaseIntegration } from '@sentry/supabase';

// These are the default development keys for a local Supabase instance
const NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cGxvcmV0ZXN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2';

export const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

Sentry.addIntegration(
  supabaseIntegration({
    supabaseClient: supabase,
  }),
);
