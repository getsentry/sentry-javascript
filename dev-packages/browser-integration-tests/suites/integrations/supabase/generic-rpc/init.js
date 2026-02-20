import * as Sentry from '@sentry/browser';
import { createClient } from '@supabase/supabase-js';

window.Sentry = Sentry;

const supabaseClient = createClient('https://test.supabase.co', 'test-key');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration(), Sentry.supabaseIntegration({ supabaseClient })],
  tracesSampleRate: 1.0,
});

// Simulate generic RPC call
async function callGenericRpc() {
  try {
    await supabaseClient.rpc('my_custom_function', { param1: 'value1' });
  } catch (error) {
    Sentry.captureException(error);
  }
}

callGenericRpc();
