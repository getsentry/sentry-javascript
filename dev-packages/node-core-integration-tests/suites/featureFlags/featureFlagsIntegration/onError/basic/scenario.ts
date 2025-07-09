import { _INTERNAL_FLAG_BUFFER_SIZE as FLAG_BUFFER_SIZE } from '@sentry/core';
import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.featureFlagsIntegration()],
});

setupOtel(client);

const flagsIntegration = Sentry.getClient()?.getIntegrationByName<Sentry.FeatureFlagsIntegration>('FeatureFlags');
for (let i = 1; i <= FLAG_BUFFER_SIZE; i++) {
  flagsIntegration?.addFeatureFlag(`feat${i}`, false);
}
flagsIntegration?.addFeatureFlag(`feat${FLAG_BUFFER_SIZE + 1}`, true); // eviction
flagsIntegration?.addFeatureFlag('feat3', true); // update

throw new Error('Test error');
