import * as Sentry from '@sentry/browser';
import { launchDarklyIntegration, buildLaunchDarklyFlagUsedHandler } from '@sentry/browser';


window.Sentry = Sentry;
window.LDIntegration = launchDarklyIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.LDIntegration],
});

const MockLaunchDarkly = {
  initialize(_clientId, context, options) {
    const flagUsedHandler = (options && options.inspectors) ? options.inspectors[0].method : undefined;

    return {
      variation(key, defaultValue) {
        if (flagUsedHandler) {
          flagUsedHandler(key, { value: defaultValue }, context); // TODO:this is async atm
        }
        return defaultValue;
      },
    };
  },
};

window.InitializeLD = () => {
  return MockLaunchDarkly.initialize(
    'example-client-id',
    { kind: 'user', key: 'example-context-key' },
    { inspectors: [buildLaunchDarklyFlagUsedHandler()] },
  );
};
