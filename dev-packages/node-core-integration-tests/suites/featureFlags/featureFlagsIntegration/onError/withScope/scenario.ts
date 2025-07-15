import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../../utils/setupOtel';

const flagsIntegration = Sentry.featureFlagsIntegration();

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  transport: loggingTransport,
  integrations: [flagsIntegration],
});

setupOtel(client);

async function run(): Promise<void> {
  flagsIntegration.addFeatureFlag('shared', true);

  Sentry.withScope(() => {
    flagsIntegration.addFeatureFlag('forked', true);
    flagsIntegration.addFeatureFlag('shared', false);
    Sentry.captureException(new Error('Error in forked scope'));
  });

  await Sentry.flush();

  flagsIntegration.addFeatureFlag('main', true);

  throw new Error('Error in main scope');
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
