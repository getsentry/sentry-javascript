import {
  BrowserTracing as OriginalBrowserTracing,
  browserTracingIntegration as originalBrowserTracingIntegration,
  defaultRequestInstrumentationOptions,
} from '@sentry/react';
import type { Integration, StartSpanOptions } from '@sentry/types';
import { nextRouterInstrumentation } from '../index.client';

/**
 * A custom BrowserTracing integration for Next.js.
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
 * TODO
 */
export function browserTracingIntegration(
  options?: Parameters<typeof originalBrowserTracingIntegration>[0],
): Integration {
  const browserTracingIntegrationInstance = originalBrowserTracingIntegration({
    ...options,
    instrumentNavigation: false,
    instrumentPageLoad: false,
  });

  return {
    ...browserTracingIntegrationInstance,
    afterAllSetup(client) {
      const startPageloadCallback = (startSpanOptions: StartSpanOptions): void => {
        if (!client.emit) {
          return;
        }
        client.emit('startPageLoadSpan', startSpanOptions);
        return undefined;
      };

      const startNavigationCallback = (startSpanOptions: StartSpanOptions): void => {
        if (!client.emit) {
          return;
        }
        client.emit('startNavigationSpan', startSpanOptions);
        return undefined;
      };

      // eslint-disable-next-line deprecation/deprecation
      nextRouterInstrumentation(() => undefined, true, true, startPageloadCallback, startNavigationCallback);
    },
  };
}
