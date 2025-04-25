import * as Sentry from '@sentry/browser';
import { createClient } from '@supabase/supabase-js';

window.Sentry = Sentry;

const supabaseClient = createClient('https://test.supabase.co', 'test-key');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.supabaseIntegration({ supabaseClient })],
  tracesSampleRate: 1.0,
});

// Simulate authentication operations
async function performAuthenticationOperations() {
  await supabaseClient.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'test-password',
  });

  await supabaseClient.auth.signOut();
}

performAuthenticationOperations();
