import { addGlobalEventProcessor, SDK_VERSION } from '@sentry/browser';
import { setSDKInfo } from '@sentry/utils';

setSDKInfo('sentry.javascript.react', 'npm:@sentry/react', SDK_VERSION);

/**
 * A global side effect that makes sure Sentry events that user
 * `@sentry/react` will correctly have Sentry events associated
 * with it.
 */
function createReactEventProcessor(): void {
  if (addGlobalEventProcessor) {
    addGlobalEventProcessor(event => {
      event.sdk = {
        ...event.sdk,
        name: 'sentry.javascript.react',
        packages: [
          ...((event.sdk && event.sdk.packages) || []),
          {
            name: 'npm:@sentry/react',
            version: SDK_VERSION,
          },
        ],
        version: SDK_VERSION,
      };

      return event;
    });
  }
}

export * from '@sentry/browser';

export { Profiler, withProfiler, useProfiler } from './profiler';
export { ErrorBoundary, withErrorBoundary } from './errorboundary';
export { createReduxEnhancer } from './redux';
export { reactRouterV3Instrumentation } from './reactrouterv3';
export { reactRouterV4Instrumentation, reactRouterV5Instrumentation, withSentryRouting } from './reactrouter';

createReactEventProcessor();
