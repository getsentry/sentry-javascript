import { defineIntegration, waitForTracingChannelBinding, type IntegrationFn } from '@sentry/core';
import { subscribeVercelAiTracingChannel } from './vercel-ai-dc-subscriber';
import * as dc from 'node:diagnostics_channel';

type VercelAiOptions = {
  /**
   * Enable or disable input recording. Enabled if `dataCollection.genAI.inputs` (or the deprecated `sendDefaultPii` option) is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings.
   * Integration-level options take precedence over global `dataCollection` config.
   */
  recordInputs?: boolean;

  /**
   * Enable or disable output recording. Enabled if `dataCollection.genAI.outputs` (or the deprecated `sendDefaultPii` option) is `true`
   * or if you set `isEnabled` to `true` in your ai SDK method telemetry settings.
   * Integration-level options take precedence over global `dataCollection` config.
   */
  recordOutputs?: boolean;

  /**
   * Enable or disable truncation of recorded input messages.
   * Defaults to `true`.
   */
  enableTruncation?: boolean;
};

const _vercelAiIntegration = ((options: VercelAiOptions = {}) => {
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
  };
}) satisfies IntegrationFn;

/**
 * Auto-instrument the `ai` SDK's native telemetry tracing channel (ai >= 7).
 */
export const vercelAiIntegration = defineIntegration(_vercelAiIntegration);
