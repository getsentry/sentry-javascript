import { defineIntegration, waitForTracingChannelBinding, type IntegrationFn } from '@sentry/core';
import { subscribeVercelAiTracingChannel } from './vercel-ai-dc-subscriber';
import * as dc from 'node:diagnostics_channel';

/**
 * Recording options shared by all AI integrations.
 *
 * In v11 every AI integration accepts this single type; prefer it over the
 * per-integration option types.
 */
export interface GenAiOptions {
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
}

/**
 * @deprecated Use {@link GenAiOptions} instead. This type will be removed in v11.
 * Note that `enableTruncation` is also removed in v11 (gen_ai input truncation no longer exists).
 */
export interface VercelAiOptions extends GenAiOptions {
  /**
   * Enable or disable truncation of recorded input messages.
   * Defaults to `true`.
   *
   * @deprecated gen_ai input truncation is removed in v11; this option no longer has an effect there.
   */
  enableTruncation?: boolean;
}

// oxlint-disable-next-line typescript/no-deprecated
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
