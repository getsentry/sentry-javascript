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

      waitForTracingChannelBinding(() => {
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<LruMemoizerLoadContext>(CHANNELS.LRU_MEMOIZER_LOAD),
          // We only want the helper's caller-context restore for the callback lru-memoizer fires from a detached `setImmediate`.
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
