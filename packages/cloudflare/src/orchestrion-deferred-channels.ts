/**
 * Deferral for orchestrion channel events that could not be published when they occurred.
 *
 * On workerd, `channel.publish()`/`runStores()` throw at module/global scope, so a library
 * instantiated at module scope (`const app = new Hono()`) cannot emit its wrapping event
 * there. `./orchestrion-diagnostics-channel` defers those events on the global marker;
 * {@link flushDeferredChannelEvents} emits them once a request is being handled (where
 * publish works) and the SDK's `init()` has registered subscribers.
 *
 * This module imports NO `node:*` builtin, so it is safe to pull into the request wrapper on
 * runtimes without `nodejs_compat` — there the queue is always empty (no channels were ever
 * injected) and the flush is a no-op.
 */
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { getDeferredEvents } from './orchestrion-deferred-queue';

/**
 * Emit every deferred channel event via the real channel. Called at the top of the request
 * handler, after `init()` has subscribed. Uses bare `start`/`end` publish (never `runStores`),
 * so no `bindStore` producer runs and no span is parented to this request — only the plain
 * subscribers (the instance patchers) fire. Idempotent: it drains the queue, so later requests
 * and re-entrant calls are no-ops.
 */
export function flushDeferredChannelEvents(): void {
  const deferred = getDeferredEvents();
  if (deferred.length === 0) {
    return;
  }
  const pending = deferred.splice(0, deferred.length);
  for (const { channel, ctx, hadError } of pending) {
    try {
      channel.start.publish(ctx);
      if (hadError) {
        channel.error.publish(ctx);
      }
      channel.end.publish(ctx);
    } catch (error) {
      DEBUG_BUILD && debug.warn('[orchestrion] failed to emit a deferred channel event', error);
    }
  }
}
