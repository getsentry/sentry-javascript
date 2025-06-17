import type { Scope } from '@sentry/node';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.featureFlagsIntegration()],
});

const flagsIntegration = Sentry.getClient()?.getIntegrationByName<Sentry.FeatureFlagsIntegration>('FeatureFlags');
flagsIntegration?.addFeatureFlag('shared', true);

Sentry.withScope((_scope: Scope) => {
  flagsIntegration?.addFeatureFlag('forked', true);
  flagsIntegration?.addFeatureFlag('shared', false);
  Sentry.captureException(new Error('Error in forked scope'));
});

flagsIntegration?.addFeatureFlag('main', true);
throw new Error('Error in main scope');
