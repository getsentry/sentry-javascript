import * as Sentry from '@sentry/browser';
import { launchDarklyIntegration } from '@sentry/browser';

window.Sentry = Sentry;
window.LDIntegration = launchDarklyIntegration();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  sampleRate: 1.0,
  integrations: [window.LDIntegration],
});

// TODO: can't type this unless we duplicate to every test.ts file
window.MockLaunchDarkly = {
  initialize(_clientId, context, options) {
    // const flagUsedHandler = options?.inspectors?.[0].method;

    return {
      variation(key, defaultValue) {
        // flagUsedHandler?.(key, { value: defaultValue }, context);
        return defaultValue;
      },
    };
  },
};

console.log(window.MockLaunchDarkly)
