/**
 * The queue of orchestrion channel events that could not be published at module scope, shared by
 * `./orchestrion-diagnostics-channel`, which defers them, and `./orchestrion-deferred-channels`,
 * which flushes them.
 *
 * This module has no runtime imports: the facade must not load `@sentry/core` (its CommonJS build
 * would add a second copy of `@sentry/core` to the bundle), and the request wrapper must not load a
 * `node:` builtin (it runs on runtimes without `nodejs_compat`).
 */
import type { InternalGlobal } from '@sentry/core';

export type Ctx = Record<string, unknown>;

export interface PublishableTracingChannel {
  start: { publish(ctx: Ctx): void };
  end: { publish(ctx: Ctx): void };
  error: { publish(ctx: Ctx): void };
}

export interface DeferredChannelEvent {
  channel: PublishableTracingChannel;
  ctx: Ctx;
  hadError: boolean;
}

// The queue is on the global marker, not in this module: a bundle can hold both builds of the SDK. Transformed
// CommonJS packages (`express`, `mysql`) `require` the facade, so they defer through its CommonJS build, while the
// request wrapper that flushes is usually the ES module build.
export function getDeferredEvents(): DeferredChannelEvent[] {
  const marker = ((globalThis as unknown as InternalGlobal).__SENTRY_ORCHESTRION__ ??= {});
  return (marker.deferredChannelEvents ??= []) as DeferredChannelEvent[];
}
