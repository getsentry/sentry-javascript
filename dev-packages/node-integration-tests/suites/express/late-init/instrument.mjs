import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// First: preload the express instrumentation without calling Sentry.init().
// registers OTel module hook, patches the Express module with no config.
Sentry.preloadOpenTelemetry({ integrations: ['Express'] });

// call Sentry.init() with express integration config.
// instrumentExpress is already registered, so this calls setConfig() on the
// existing instrumentation to update its options. The lazy getOptions()
// in patchLayer ensures the updated options are read at request time.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  // suppress the middleware layer that the cors module generates
  integrations: [Sentry.expressIntegration({ ignoreLayersType: ['middleware'] })],
});
