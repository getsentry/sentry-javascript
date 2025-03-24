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
    new Sentry.BrowserTracing({
      tracingOrigins: ['localhost', 'my.supabase.co'],
    }),
    Sentry.supabaseIntegration(supabase)
  ],
  tracesSampleRate: 1.0,
});

// Simulate database operations
async function performDatabaseOperations() {
  try {
    await supabase
      .from('todos')
      .insert([{ title: 'Test Todo' }]);

    await supabase
      .from('todos')
      .select('*');

    // Trigger an error to capture the breadcrumbs
    throw new Error('Test Error');
  } catch (error) {
    Sentry.captureException(error);
  }
}

performDatabaseOperations();
