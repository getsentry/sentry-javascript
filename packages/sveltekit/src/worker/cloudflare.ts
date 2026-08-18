import {
  type CloudflareOptions,
  getDefaultIntegrations as getDefaultCloudflareIntegrations,
  setAsyncLocalStorageAsyncContextStrategy,
} from '@sentry/cloudflare';
import { wrapRequestHandler } from '@sentry/cloudflare/request';
import { addNonEnumerableProperty } from '@sentry/core';
import type { Handle } from '@sveltejs/kit';
import { rewriteFramesIntegration } from '../server-common/integrations/rewriteFramesIntegration';
import { svelteKitSpansIntegration } from '../server-common/integrations/svelteKitSpans';
import { getCloudflareExecutionContext } from '../server-common/utils';

/**
 *  Initializes Sentry SvelteKit Cloudflare SDK
 *  This should be before the sentryHandle() call.
 *
 *  In the Node export, this is a stub that does nothing.
 */
export function initCloudflareSentryHandle(options: CloudflareOptions): Handle {
  const opts: CloudflareOptions = {
    defaultIntegrations: [
      ...getDefaultCloudflareIntegrations(options),
      rewriteFramesIntegration(),
      svelteKitSpansIntegration(),
    ],
    // SvelteKit emits its own OpenTelemetry spans (Kit tracing), so — like the Node SvelteKit SDK — it
    // defaults to registering the tracer provider instead of inheriting Cloudflare's no-provider default.
    // A user-provided value still overrides this via `...options`.
    enableOpenTelemetrySetup: true,
    ...options,
  };

  setAsyncLocalStorageAsyncContextStrategy();

  const handleInitSentry: Handle = ({ event, resolve }) => {
    // if event.platform exists (should be there in a cloudflare worker), then do the cloudflare sentry init
    if (event.platform) {
      // This is an optional local that the `sentryHandle` handler checks for to avoid double isolation
      // In Cloudflare the `wrapRequestHandler` function already takes care of
      // - request isolation
      // - trace continuation
      // -setting the request onto the scope
      addNonEnumerableProperty(event.locals, '_sentrySkipRequestIsolation', true);
      return wrapRequestHandler(
        {
          options: opts,
          request: event.request,
          // @ts-expect-error This will exist in Cloudflare
          context: getCloudflareExecutionContext(event.platform),
          // We don't want to capture errors here, as we want to capture them in the `sentryHandle` handler
          // where we can distinguish between redirects and actual errors.
          captureErrors: false,
        },
        () => resolve(event),
      );
    }
    return resolve(event);
  };

  return handleInitSentry;
}
