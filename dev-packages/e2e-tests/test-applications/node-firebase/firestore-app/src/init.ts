import * as Sentry from '@sentry/node';

// `firebaseIntegration()` is the channel-based (orchestrion diagnostics-channel) integration by
// default. This file is imported before `app.ts` imports `firebase/firestore/lite`, so the
// channel-injection hooks are installed before firestore loads.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.firebaseIntegration()],
  defaultIntegrations: false,
  tunnel: `http://localhost:3031/`, // proxy server
});
