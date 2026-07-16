import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { lruMemoizerModuleNames } from '../../orchestrion/config/lru-memoizer';

// Same name as the OTel integration by design — when enabled, the OTel
// 'LruMemoizer' integration is omitted from the default set.
const INTEGRATION_NAME = 'LruMemoizer' as const;

interface LruMemoizerLoadContext {
  arguments: unknown[];
}

function instrumentLruMemoizer() {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<LruMemoizerLoadContext>(CHANNELS.LRU_MEMOIZER_LOAD),
    // We only want the helper's caller-context restore for the callback lru-memoizer fires from a detached `setImmediate`.
    () => undefined,
  );
}

const _lruMemoizerChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, lruMemoizerModuleNames, instrumentLruMemoizer, []);
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
