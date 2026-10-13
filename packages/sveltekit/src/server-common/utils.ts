import { captureException, objectify } from '@sentry/core';
import type { RequestEvent } from '@sveltejs/kit';
import { isHttpError, isRedirect } from '../common/utils';

/** The subset of Cloudflare's `ExecutionContext` the SDK relies on. */
export type MinimalCloudflareExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type CloudflareExecutionContextProvider = () => MinimalCloudflareExecutionContext | undefined;

let fallbackExecutionContextProvider: CloudflareExecutionContextProvider | undefined;

/**
 * Registers where to get the execution context from when `platform` doesn't carry one.
 *
 * Since `8.0.0-next.7`, `@sveltejs/adapter-cloudflare` no longer passes a `platform` object to
 * SvelteKit at all; `waitUntil` is imported from `cloudflare:workers` instead. That module only
 * resolves under the `workerd` export condition, so the entry point for that condition registers it
 * here instead of the shared worker code importing it directly.
 *
 * @see https://github.com/sveltejs/kit/pull/16754
 */
export function setCloudflareExecutionContextFallback(provider: CloudflareExecutionContextProvider | undefined): void {
  fallbackExecutionContextProvider = provider;
}

/**
 * Reads the Cloudflare execution context off a SvelteKit `platform` object, falling back to the
 * provider registered via `setCloudflareExecutionContextFallback`.
 *
 * The property name differs by adapter version:
 * - `@sveltejs/adapter-cloudflare` <= 7 exposes it as `platform.context`
 * - `@sveltejs/adapter-cloudflare` 8 renamed it to `platform.ctx`, and later prereleases dropped
 *   `platform` altogether (see the fallback)
 *
 * We read all of them so that request isolation and `waitUntil`-based flushing keep working across
 * the adapter versions our peer range allows. Every access fails silently when the shape changes,
 * so dropping any of them costs us events without surfacing an error.
 *
 * @see https://github.com/sveltejs/kit/pull/16668
 */
export function getCloudflareExecutionContext(platform: unknown): MinimalCloudflareExecutionContext | undefined {
  const { ctx, context } = (platform ?? {}) as {
    ctx?: MinimalCloudflareExecutionContext;
    context?: MinimalCloudflareExecutionContext;
  };

  return ctx ?? context ?? fallbackExecutionContextProvider?.();
}

/**
 * Takes a request event and extracts traceparent and DSC data
 * from the `sentry-trace` and `baggage` DSC headers.
 *
 * Sets propagation context as a side effect.
 */
export function getTracePropagationData(event: RequestEvent): { sentryTrace: string; baggage: string | null } {
  const sentryTrace = event.request.headers.get('sentry-trace') || '';
  const baggage = event.request.headers.get('baggage');

  return { sentryTrace, baggage };
}

/**
 * Extracts a server-side sveltekit error, filters a couple of known errors we don't want to capture
 * and captures the error via `captureException`.
 *
 * @param e error
 *
 * @returns an objectified version of @param e
 */
export function sendErrorToSentry(e: unknown, handlerFn: 'handle' | 'load' | 'server_route'): object {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  // The error() helper is commonly used to throw errors in load functions: https://kit.svelte.dev/docs/modules#sveltejs-kit-error
  // If we detect a thrown error that is an instance of HttpError, we don't want to capture 4xx errors as they
  // could be noisy.
  // Also the `redirect(...)` helper is used to redirect users from one page to another. We don't want to capture thrown
  // `Redirect`s as they're not errors but expected behaviour
  if (
    isRedirect(objectifiedErr) ||
    (isHttpError(objectifiedErr) && objectifiedErr.status < 500 && objectifiedErr.status >= 400)
  ) {
    return objectifiedErr;
  }

  captureException(objectifiedErr, {
    mechanism: {
      type: `auto.function.sveltekit.${handlerFn}`,
      handled: false,
    },
  });

  return objectifiedErr;
}
