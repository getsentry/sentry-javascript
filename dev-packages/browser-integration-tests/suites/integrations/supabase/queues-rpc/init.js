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
    await supabaseClient.rpc('enqueue', {
      queue_name: 'todos',
      msg: { title: 'Test Todo' },
    });

    await supabaseClient.rpc('dequeue', {
      queue_name: 'todos',
    });
  } catch (error) {
    Sentry.captureException(error);
  }
}

performQueueOperations();
