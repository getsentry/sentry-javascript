import { addGlobalEventProcessor, SDK_VERSION } from '@sentry/browser';

function createReactEventProcessor(): void {
  // Only add the event processor if not running in React Native.
  // tslint:disable-next-line: strict-type-predicates
  const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

  if (addGlobalEventProcessor && !isReactNative) {
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

createReactEventProcessor();
