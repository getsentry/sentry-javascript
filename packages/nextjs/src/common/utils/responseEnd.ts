import type { AsyncContextStrategy, Span } from '@sentry/core';
import {
  debug,
  fill,
  flush,
  getAsyncContextStrategy,
  getClient,
  getMainCarrier,
  GLOBAL_OBJ,
  setHttpStatus,
} from '@sentry/core';
import { vercelWaitUntil } from '@sentry/core/server';
import type { ServerResponse } from 'http';
import { DEBUG_BUILD } from '../debug-build';
import type { ResponseEndMethod, WrappedResponseEndMethod } from '../types';

/**
 * Wrap `res.end()` so that it ends the span and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe, because the native `.end()` actually *is* (effectively) async, and
 * its run actually *is* (literally) awaited, just manually so (which reflects the fact that the core of the
 * request/response code in Node by far predates the introduction of `async`/`await`). When `.end()` is done, it emits
 * the `prefinish` event, and only once that fires does request processing continue. See
 * https://github.com/nodejs/node/commit/7c9b607048f13741173d397795bac37707405ba7.
 *
 * Also note: `res.end()` isn't called until *after* all response data and headers have been sent, so blocking inside of
 * `end` doesn't delay data getting to the end user. See
 * https://nodejs.org/api/http.html#responseenddata-encoding-callback.
 *
 * @param span The span tracking the request
 * @param res: The request's corresponding response
 */
export function autoEndSpanOnResponseEnd(span: Span, res: ServerResponse): void {
  const wrapEndMethod = (origEnd: ResponseEndMethod): WrappedResponseEndMethod => {
    return function sentryWrappedEnd(this: ServerResponse, ...args: unknown[]) {
      finishSpan(span, this);
      return origEnd.call(this, ...args);
    };
  };

  // Prevent double-wrapping
  // res.end may be undefined during build when using `next export` to statically export a Next.js app
  if (res.end && !(res.end as WrappedResponseEndMethod).__sentry_original__) {
    fill(res, 'end', wrapEndMethod);
  }
}

/** Finish the given response's span and set HTTP status data */
export function finishSpan(span: Span, res: ServerResponse): void {
  setHttpStatus(span, res.statusCode);
  span.end();
}

/**
 * Flushes pending Sentry events with a 2 second timeout and in a way that cannot create unhandled promise rejections.
 */
export async function flushSafelyWithTimeout(): Promise<void> {
  try {
    DEBUG_BUILD && debug.log('Flushing events...');
    await flush(2000);
    DEBUG_BUILD && debug.log('Done flushing events');
  } catch (e) {
    DEBUG_BUILD && debug.log('Error while flushing events:\n', e);
  }
}

/**
 * Uses platform-specific waitUntil function to wait for the provided task to complete without blocking.
 */
export function waitUntil(task: Promise<unknown>): void {
  // If deployed on Cloudflare, use the Cloudflare waitUntil function to flush the events
  if (isCloudflareWaitUntilAvailable()) {
    cloudflareWaitUntil(task);
    return;
  }

  // otherwise, use vercel's
  vercelWaitUntil(task);
}

type MinimalCloudflareContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waitUntil(promise: Promise<any>): void;
};

/**
 * Gets the Cloudflare context from the global object.
 * Relevant to opennext
 * https://github.com/opennextjs/opennextjs-cloudflare/blob/b53a046bd5c30e94a42e36b67747cefbf7785f9a/packages/cloudflare/src/cli/templates/init.ts#L17
 */
function _getOpenNextCloudflareContext(): MinimalCloudflareContext | undefined {
  const openNextCloudflareContextSymbol = Symbol.for('__cloudflare-context__');

  return (
    GLOBAL_OBJ as typeof GLOBAL_OBJ & {
      [openNextCloudflareContextSymbol]?: {
        ctx: MinimalCloudflareContext;
      };
    }
  )[openNextCloudflareContextSymbol]?.ctx;
}

/**
 * Function that delays closing of a Cloudflare lambda until the provided promise is resolved.
 */
export function cloudflareWaitUntil(task: Promise<unknown>): void {
  _getOpenNextCloudflareContext()?.waitUntil(task);
}

/**
 * Checks if the Cloudflare waitUntil function is available globally.
 */
export function isCloudflareWaitUntilAvailable(): boolean {
  return typeof _getOpenNextCloudflareContext()?.waitUntil === 'function';
}

type MarkedAsyncContextStrategy = AsyncContextStrategy & { _sentryNextjsCloudflare?: boolean };

/**
 * Marks the async context strategy that `withSentry` of `@sentry/nextjs/cloudflare` installed. The mark is on the
 * strategy in the global carrier, because the Worker entry and the server build of Next.js each bundle their own copy
 * of `@sentry/nextjs`.
 */
export function markAsyncContextOwnedByNextjsCloudflare(): void {
  (getAsyncContextStrategy(getMainCarrier()) as MarkedAsyncContextStrategy)._sentryNextjsCloudflare = true;
}

/**
 * Whether `withSentry` of `@sentry/nextjs/cloudflare` set up the async context of this Worker, also outside a request.
 */
export function isAsyncContextOwnedByNextjsCloudflare(): boolean {
  const strategy: MarkedAsyncContextStrategy = getAsyncContextStrategy(getMainCarrier());
  return !!strategy._sentryNextjsCloudflare;
}

/**
 * Whether `withSentry` of `@sentry/nextjs/cloudflare` set up the async context of this Worker, or a request of
 * `withSentry` from `@sentry/cloudflare` runs. A client of `init` would then replace its async context strategy while
 * a request runs (#24603).
 */
export function isAsyncContextOwnedByCloudflare(): boolean {
  const strategy = getAsyncContextStrategy(getMainCarrier());
  // The AsyncLocalStorage strategy of `@sentry/cloudflare` has no `withActiveSpan`.
  const asyncLocalStorage = strategy.getTracingChannelBinding?.()?.asyncLocalStorage as
    | { getStore(): unknown }
    | undefined;
  return (
    isAsyncContextOwnedByNextjsCloudflare() ||
    (!strategy.withActiveSpan &&
      asyncLocalStorage?.getStore() !== undefined &&
      GLOBAL_OBJ.navigator?.userAgent === 'Cloudflare-Workers')
  );
}

/**
 * Sets the build release of `withSentryConfig` on the current client if it has none, and stores it for the clients
 * that `withSentry` of `@sentry/nextjs/cloudflare` creates later. Only code that Next.js compiles can read it.
 */
export function setCloudflareWorkerRelease(release: string | undefined): void {
  (GLOBAL_OBJ as { _sentryRelease?: string })._sentryRelease ??= release;
  const options = getClient()?.getOptions();
  if (options && !options.release) {
    options.release = release;
  }
}
