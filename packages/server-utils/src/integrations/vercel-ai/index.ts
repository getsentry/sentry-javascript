import { defineIntegration, waitForTracingChannelBinding, type IntegrationFn } from '@sentry/core';
import type { GenAiOptions } from '../../ai/core/utils';
import { subscribeVercelAiTracingChannel } from './vercel-ai-dc-subscriber';
import * as dc from 'node:diagnostics_channel';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { vercelAiModuleNames } from '../../orchestrion/config/vercel-ai';
import { subscribeVercelAiOrchestrionChannels } from './vercel-ai-orchestrion-subscriber';

/** Options for the Vercel AI integration. */
export type VercelAiOptions = GenAiOptions;

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  return {
    name: 'VercelAI' as const,
    setupOnce() {
      // Bail if this is not available
      if (!dc.tracingChannel) {
        return;
      }

      // Subscribe to the `ai` SDK's native telemetry tracing channel (ai >= 7).
      // This is a no-op on versions that don't publish to the channel, so it is always safe to call.
      waitForTracingChannelBinding(() => {
        subscribeVercelAiTracingChannel(dc.tracingChannel, options);
      });
    },
    setup(client) {
      invokeOrchestrionInstrumentation(client, vercelAiModuleNames, instrumentVercelAiOrchestrion, [options]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the `ai` SDK. Supported are:
 * - v7 via native `ai:telemetry` tracing channel
 * - v4, v5 & v6 via orchestrion `orchestrion:ai:*` channels
 */
export const vercelAIIntegration = defineIntegration(_vercelAIIntegration);

function instrumentVercelAiOrchestrion(options: VercelAiOptions): void {
  subscribeVercelAiOrchestrionChannels(dc.tracingChannel, options);
}
