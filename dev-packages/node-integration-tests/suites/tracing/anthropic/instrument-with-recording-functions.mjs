import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.anthropicAIIntegration({
      recordInputs: call =>
        call.operation === 'execute_tool'
          ? call.input?.city === 'Vienna'
          : !!call.request?.metadata?.user_id?.startsWith('public'),
      recordOutputs: () => Sentry.getCurrentScope().getScopeData().tags.privacy === 'public',
    }),
  ],
});
