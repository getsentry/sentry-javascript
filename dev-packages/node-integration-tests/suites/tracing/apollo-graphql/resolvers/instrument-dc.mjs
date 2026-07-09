import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Configure graphql on the diagnostics-channel injection path: opt in, then pass the matching
// `diagnosticsChannelInjectionIntegrations()` entry explicitly so its options (here
// `ignoreResolveSpans: false`) apply. This explicit instance wins over the default one the opt-in swaps in.
const { graphqlIntegration } = Sentry.diagnosticsChannelInjectionIntegrations();
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [graphqlIntegration({ ignoreResolveSpans: false })],
  transport: loggingTransport,
});
