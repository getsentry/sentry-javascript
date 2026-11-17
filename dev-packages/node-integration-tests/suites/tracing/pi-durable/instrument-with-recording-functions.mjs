import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Runs start from whichever context woke the scheduler, never from the request's, so these decide from
// what pi-durable hands over. The pi-ai integration has no options of its own: these decide the chat
// spans too.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.piDurableIntegration({
      recordInputs: call =>
        (call.operation === 'chat' ? call.runtime : call.api).conversationId === globalThis.publicConversationId,
      recordOutputs: call => call.operation === 'chat' && globalThis.recordChatOutputs,
    }),
  ],
});
