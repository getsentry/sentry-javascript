import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

// Same name as the OTel integration by design — when enabled, the OTel
// 'LruMemoizer' integration is omitted from the default set.
const INTEGRATION_NAME = 'LruMemoizer' as const;

interface LruMemoizerLoadContext {
  arguments: unknown[];
}

const _lruMemoizerChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable before Node 18.19 so do nothing in that case.
      if (!diagnosticsChannel.tracingChannel) {
        return;
      }

      DEBUG_BUILD && debug.log(`[orchestrion:lru-memoizer] subscribing to channel "${CHANNELS.LRU_MEMOIZER_LOAD}"`);

      // lru-memoizer creates no span: it queues the load callback and fires it later via
      // `setImmediate`, from a detached context where the caller's scope is no longer active.
      // Returning `undefined` from `getSpan` opts out of span creation entirely — the helper's
      // `asyncStart` rebind still restores the caller's context for that callback, which is all this
      // instrumentation needs (keeping memoized work parented to the caller). `bindTracingChannelToSpan`
      // uses `bindStore`, which needs the async-context binding `initOpenTelemetry()` registers after
      // integration `setupOnce`, so defer until it's available (matches the other channel subscribers).
      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<LruMemoizerLoadContext>(CHANNELS.LRU_MEMOIZER_LOAD),
          () => undefined,
        );
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
