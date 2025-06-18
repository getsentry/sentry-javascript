import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const flagsIntegration = Sentry.featureFlagsIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  transport: loggingTransport,
  integrations: [flagsIntegration],
});

flagsIntegration.addFeatureFlag('shared', true);

Sentry.withScope(() => {
  flagsIntegration.addFeatureFlag('forked', true);
  flagsIntegration.addFeatureFlag('shared', false);
  Sentry.captureException(new Error('Error in forked scope'));
});

flagsIntegration.addFeatureFlag('main', true);

// To ensure order of sent events
setTimeout(() => {
  throw new Error('Error in main scope');
}, 1);
