import { defineIntegration, waitForTracingChannelBinding, type IntegrationFn } from '@sentry/core';
import type { GenAiOptions } from '../ai/core/utils';
import { subscribeVercelAiTracingChannel } from './vercel-ai-dc-subscriber';
import * as dc from 'node:diagnostics_channel';

const _vercelAiIntegration = ((options: GenAiOptions = {}) => {
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
