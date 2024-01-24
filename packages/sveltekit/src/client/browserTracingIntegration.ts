import { BrowserTracing as OriginalBrowserTracing } from '@sentry/svelte';
import type { Integration } from '@sentry/types';
import { svelteKitRoutingInstrumentation } from './router';

/**
 * A custom BrowserTracing integration for Sveltekit.
 * @deprecated Use `browserTracingIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export class BrowserTracing extends OriginalBrowserTracing {
  // eslint-disable-next-line deprecation/deprecation
  public constructor(options?: ConstructorParameters<typeof OriginalBrowserTracing>[0]) {
    super({
      routingInstrumentation: svelteKitRoutingInstrumentation,
      ...options,
    });
  }
}

/**
 * A custom BrowserTracing integration for Sveltekit.
 */
// eslint-disable-next-line deprecation/deprecation
export function browserTracingIntegration(options?: ConstructorParameters<typeof BrowserTracing>[0]): Integration {
  // eslint-disable-next-line deprecation/deprecation
  return new BrowserTracing(options);
}
