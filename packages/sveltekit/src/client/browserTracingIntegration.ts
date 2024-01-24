import { BrowserTracing as OriginalBrowserTracing } from '@sentry/svelte';
import { svelteKitRoutingInstrumentation } from './router';

/**
 * A custom BrowserTracing integration for Sveltekit.
 */
export class BrowserTracing extends OriginalBrowserTracing {
  public constructor(options?: ConstructorParameters<typeof OriginalBrowserTracing>[0]) {
    super({
      routingInstrumentation: svelteKitRoutingInstrumentation,
      ...options,
    });
  }
}
