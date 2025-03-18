import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

Sentry.addIntegration(
  Sentry.supabaseIntegration({
    supabaseClient: supabase,
  }),
);
