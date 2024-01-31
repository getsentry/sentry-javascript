import {
  BrowserTracing as OriginalBrowserTracing,
  browserTracingIntegration as originalBrowserTracingIntegration,
  defaultRequestInstrumentationOptions,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry/react';
import type { Integration, StartSpanOptions } from '@sentry/types';
import { nextRouterInstrumentation } from '../index.client';

/**
 * A custom BrowserTracing integration for Next.js.
 *
 * @deprecated Use `browserTracingIntegration` instead.
 */
export class BrowserTracing extends OriginalBrowserTracing {
  public constructor(options?: ConstructorParameters<typeof OriginalBrowserTracing>[0]) {
    super({
      // eslint-disable-next-line deprecation/deprecation
      tracingOrigins:
        process.env.NODE_ENV === 'development'
          ? [
              // Will match any URL that contains "localhost" but not "webpack.hot-update.json" - The webpack dev-server
              // has cors and it doesn't like extra headers when it's accessed from a different URL.
              // TODO(v8): Ideally we rework our tracePropagationTargets logic so this hack won't be necessary anymore (see issue #9764)
              /^(?=.*localhost)(?!.*webpack\.hot-update\.json).*/,
              /^\/(?!\/)/,
            ]
          : // eslint-disable-next-line deprecation/deprecation
            [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
      // eslint-disable-next-line deprecation/deprecation
      routingInstrumentation: nextRouterInstrumentation,
      ...options,
    });
  }
}

/**
 * A custom BrowserTracing integration for Next.js.
 */
export function browserTracingIntegration(
  options?: Parameters<typeof originalBrowserTracingIntegration>[0],
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    // eslint-disable-next-line deprecation/deprecation
    tracingOrigins:
      process.env.NODE_ENV === 'development'
        ? [
            // Will match any URL that contains "localhost" but not "webpack.hot-update.json" - The webpack dev-server
            // has cors and it doesn't like extra headers when it's accessed from a different URL.
            // TODO(v8): Ideally we rework our tracePropagationTargets logic so this hack won't be necessary anymore (see issue #9764)
            /^(?=.*localhost)(?!.*webpack\.hot-update\.json).*/,
            /^\/(?!\/)/,
          ]
        : // eslint-disable-next-line deprecation/deprecation
          [...defaultRequestInstrumentationOptions.tracingOrigins, /^(api\/)/],
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      const startPageloadCallback = (startSpanOptions: StartSpanOptions): void => {
        startBrowserTracingPageLoadSpan(client, startSpanOptions);
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): void => {
        startBrowserTracingNavigationSpan(client, startSpanOptions);
      };

      // We need to run the navigation span instrumentation before the `afterAllSetup` hook on the normal browser
      // tracing integration because we need to ensure the order of execution is as follows:
      // Instrumentation to start span on RSC fetch request runs -> Instrumentation to put tracing headers from active span on fetch runs
      // If it were the other way around, the RSC fetch request would not receive the tracing headers from the navigation transaction.
      // eslint-disable-next-line deprecation/deprecation
      nextRouterInstrumentation(
        () => undefined,
        false,
        options?.instrumentNavigation,
        startPageloadCallback,
        startNavigationCallback,
      );

      browserTracingIntegrationInstance.afterAllSetup(client);

      // eslint-disable-next-line deprecation/deprecation
      nextRouterInstrumentation(
        () => undefined,
        options?.instrumentPageLoad,
        false,
        startPageloadCallback,
        startNavigationCallback,
      );
    },
  };
}
