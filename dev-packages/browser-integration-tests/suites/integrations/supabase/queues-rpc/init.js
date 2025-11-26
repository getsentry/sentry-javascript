import * as Sentry from '@sentry/browser';
import { createClient } from '@supabase/supabase-js';

window.Sentry = Sentry;

const supabaseClient = createClient('https://test.supabase.co', 'test-key', {
  db: {
    schema: 'pgmq_public',
  },
});

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.supabaseIntegration({ supabaseClient })],
  tracesSampleRate: 1.0,
});

// Simulate queue operations
async function performQueueOperations() {
  try {
    await supabaseClient.rpc('send', {
      queue_name: 'todos',
      message: { title: 'Test Todo' },
    });

    await supabaseClient.rpc('pop', {
      queue_name: 'todos',
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

performQueueOperations();
