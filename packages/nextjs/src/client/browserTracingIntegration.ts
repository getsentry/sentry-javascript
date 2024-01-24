import { BrowserTracing as OriginalBrowserTracing, defaultRequestInstrumentationOptions } from '@sentry/react';
import type { Integration } from '@sentry/types';
import { nextRouterInstrumentation } from '../index.client';

/**
 * A custom BrowserTracing integration for Next.js.
 * @deprecated Use `browserTracingIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export class BrowserTracing extends OriginalBrowserTracing {
  // eslint-disable-next-line deprecation/deprecation
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
      routingInstrumentation: nextRouterInstrumentation,
      ...options,
    });
  }
}

/**
 * A custom BrowserTracing integration for Next.js.
 */
// eslint-disable-next-line deprecation/deprecation
export function browserTracingIntegration(options?: ConstructorParameters<typeof BrowserTracing>[0]): Integration {
  // eslint-disable-next-line deprecation/deprecation
  return new BrowserTracing(options);
}
