import * as Sentry from '@sentry/node';

// When `E2E_ORCHESTRION=true`, exercise the diagnostics-channel injection path (the orchestrion-based
// `Firebase` integration) instead of the OTel one. Opting in before `init()` is enough: this file is
// imported before `app.ts` imports `firebase/firestore/lite`, so the channel-injection hooks are
// installed before firestore loads.
const useOrchestrion = process.env.E2E_ORCHESTRION === 'true';

if (useOrchestrion) {
  Sentry.experimentalUseDiagnosticsChannelInjection();
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: useOrchestrion
    ? [Sentry.diagnosticsChannelInjectionIntegrations().firebaseIntegration()]
    : [Sentry.firebaseIntegration()],
  defaultIntegrations: false,
  tunnel: `http://localhost:3031/`, // proxy server
});
