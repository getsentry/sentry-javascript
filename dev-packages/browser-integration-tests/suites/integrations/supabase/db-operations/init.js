import * as Sentry from '@sentry/browser';
import { createClient } from '@supabase/supabase-js';

window.Sentry = Sentry;

const supabaseClient = createClient('https://test.supabase.co', 'test-key');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.supabaseIntegration({ supabaseClient })],
  tracesSampleRate: 1.0,
});

// Simulate database operations
async function performDatabaseOperations() {
  try {
    await supabaseClient.from('todos').insert([{ title: 'Test Todo' }]);

    await supabaseClient.from('todos').select('*');

    // Trigger an error to capture the breadcrumbs
    throw new Error('Test Error');
  } catch (error) {
    Sentry.captureException(error);
  }
}

performDatabaseOperations();
