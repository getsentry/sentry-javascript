import { _INTERNAL_MAX_FLAGS_PER_SPAN as MAX_FLAGS_PER_SPAN } from '@sentry/core';
import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.featureFlagsIntegration()],
});

setupOtel(client);

const flagsIntegration = Sentry.getClient()?.getIntegrationByName<Sentry.FeatureFlagsIntegration>('FeatureFlags');

Sentry.startSpan({ name: 'test-root-span' }, () => {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'test-nested-span' }, () => {
      for (let i = 1; i <= MAX_FLAGS_PER_SPAN; i++) {
        flagsIntegration?.addFeatureFlag(`feat${i}`, false);
      }
      flagsIntegration?.addFeatureFlag(`feat${MAX_FLAGS_PER_SPAN + 1}`, true); // dropped flag
      flagsIntegration?.addFeatureFlag('feat3', true); // update
    });
  });
});
