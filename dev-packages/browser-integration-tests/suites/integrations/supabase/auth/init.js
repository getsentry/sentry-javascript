import * as Sentry from '@sentry/browser';

import { createClient } from '@supabase/supabase-js';
window.Sentry = Sentry;

const supabase = createClient(
  'https://test.supabase.co',
  'test-key'
);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.supabaseIntegration(supabase)
  ],
  tracesSampleRate: 1.0,
});

// Simulate authentication operations
async function performAuthenticationOperations() {
  try {
    await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'test-password',
    });

    await supabase.auth.signOut();
  } catch (error) {
    Sentry.captureException(error);
  }
}

performAuthenticationOperations();
