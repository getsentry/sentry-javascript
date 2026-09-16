/**
 * Deferral for orchestrion channel events that could not be published when they occurred.
 *
 * On workerd, `channel.publish()`/`runStores()` throw at module/global scope, so a library
 * instantiated at module scope (`const app = new Hono()`) cannot emit its wrapping event
 * there. {@link ./orchestrion-diagnostics-channel} defers those events here;
 * {@link flushDeferredChannelEvents} emits them once a request is being handled (where
 * publish works) and the SDK's `init()` has registered subscribers.
 *
 * This module imports NO `node:*` builtin, so it is safe to pull into the request wrapper on
 * runtimes without `nodejs_compat` — there the queue is always empty (no channels were ever
 * injected) and the flush is a no-op.
 */
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

type Ctx = Record<string, unknown>;

// The minimal slice of a `node:diagnostics_channel` TracingChannel we emit on. Declared locally
// (rather than imported from `node:diagnostics_channel`) so this module's graph carries no `node:`
// specifier — `wrapRequestHandler` must load on runtimes without `nodejs_compat`, and the
// module-graph test forbids any `node:` import reachable from it.
interface PublishableTracingChannel {
  start: { publish(ctx: Ctx): void };
  end: { publish(ctx: Ctx): void };
  error: { publish(ctx: Ctx): void };
}

interface DeferredChannelEvent {
  channel: PublishableTracingChannel;
  ctx: Ctx;
  hadError: boolean;
}

const deferred: DeferredChannelEvent[] = [];
const DEFERRED = Symbol('sentryOrchestrionDeferred');

/** workerd's global-scope guard is the only error we degrade on; anything else is a real fault. */
export function isGlobalScopeError(error: unknown): boolean {
  return error instanceof Error && /within global scope/.test(error.message);
}

/** Queue a channel event that could not be published now, at most once per context object. */
export function deferChannelEvent(channel: PublishableTracingChannel, ctx: Ctx): void {
  if ((ctx as Record<symbol, unknown>)[DEFERRED]) {
    return;
  }
  (ctx as Record<symbol, unknown>)[DEFERRED] = true;
  deferred.push({ channel, ctx, hadError: 'error' in ctx });
}

/**
 * Emit every deferred channel event via the real channel. Called at the top of the request
 * handler, after `init()` has subscribed. Uses bare `start`/`end` publish (never `runStores`),
 * so no `bindStore` producer runs and no span is parented to this request — only the plain
 * subscribers (the instance patchers) fire. Idempotent: it drains the queue, so later requests
 * and re-entrant calls are no-ops.
 */
export function flushDeferredChannelEvents(): void {
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
