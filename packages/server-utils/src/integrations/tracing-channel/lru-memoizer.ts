import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, getCurrentScope, withScope } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';

// Same name as the OTel integration by design — when enabled, the OTel
// 'LruMemoizer' integration is omitted from the default set.
const INTEGRATION_NAME = 'LruMemoizer';

interface LruMemoizerChannelContext {
  arguments: unknown[];
}

const _lruMemoizerChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 — no-op instead of throwing (#21783).
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[orchestrion:lru-memoizer] subscribing to channel "${CHANNELS.LRU_MEMOIZER_LOAD}"`);
      const lruMemoizerCh = diagnosticsChannel.tracingChannel(CHANNELS.LRU_MEMOIZER_LOAD);

      lruMemoizerCh.subscribe({
        start(rawCtx) {
          const ctx = rawCtx as LruMemoizerChannelContext;
          if (ctx.arguments.length === 0) {
            return;
          }

          // Capture the scope while we're still synchronously inside the memoized call.
          // lru-memoizer queues the callback and fires it later via setImmediate, where the
          // active scope no longer reflects the caller's context.
          const scope = getCurrentScope();
          const cbIdx = ctx.arguments.length - 1;
          const orchestrionWrappedCb = ctx.arguments[cbIdx];

          if (typeof orchestrionWrappedCb !== 'function') {
            return;
          }

          const wrapped = orchestrionWrappedCb as (...a: unknown[]) => unknown;
          ctx.arguments[cbIdx] = function (this: unknown, ...args: unknown[]): unknown {
            return withScope(scope, () => wrapped.apply(this, args));
          };
        },
        end() {},
        asyncStart() {},
        asyncEnd() {},
        error() {},
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * EXPERIMENTAL — orchestrion-driven lru-memoizer integration. Subscribes to
 * `orchestrion:lru-memoizer:load` (injected into `lru-memoizer/lib/async.js`'s
 * `memoizedFunction`). Creates no spans; only re-runs the memoized callback with the
 * caller's scope. Requires the orchestrion runtime hook or bundler plugin.
 */
export const lruMemoizerChannelIntegration = defineIntegration(_lruMemoizerChannelIntegration);
