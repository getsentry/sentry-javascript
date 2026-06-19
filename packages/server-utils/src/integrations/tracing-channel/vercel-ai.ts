import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration, waitForTracingChannelBinding } from '@sentry/core';
import { vercelAiIntegration as baseVercelAiIntegration } from '../../vercel-ai';
import * as dc from 'node:diagnostics_channel';
import { subscribeVercelAiOrchestrionChannels } from '../../vercel-ai/vercel-ai-orchestrion-v6-subscriber';

type VercelAiOptions = Parameters<typeof baseVercelAiIntegration>[0];

// In channel-based (orchestrion) mode we emit our own `gen_ai.*` spans from the
// diagnostics channels. The `ai` SDK still emits its own native OpenTelemetry
// spans whenever the user enables `experimental_telemetry`, which would be
// duplicates. Every native `ai` span carries an `ai.operationId` attribute
// (e.g. `ai.generateText`, `ai.generateText.doGenerate`, `ai.toolCall`) at span
// start, whereas our channel spans use `vercel.ai.operationId` — so we drop the
// native ones up front via `ignoreSpans`, before any vercel-ai processing runs.
const NATIVE_VERCEL_AI_SPANS = { attributes: { 'ai.operationId': /^ai\./ } };

const _vercelAiChannelIntegration = ((options: VercelAiOptions = {}) => {
  const parentIntegration = baseVercelAiIntegration(options);

  return extendIntegration(parentIntegration, {
    options,
    beforeSetup(client) {
      // Ensure we drop spans emitted by ai v6 or below
      // To avoid double-instrumentation - in this scenario, we only want to rely on our own spans
      const options = client.getOptions();
      options.ignoreSpans = [...(options.ignoreSpans || []), NATIVE_VERCEL_AI_SPANS];
    },
    setupOnce() {
      // Bail if this is not available
      if (!dc.tracingChannel) {
        return;
      }

      waitForTracingChannelBinding(() => {
        subscribeVercelAiOrchestrionChannels(dc.tracingChannel, options);
      });
    },
  });
}) satisfies IntegrationFn;

/**
 * Auto-instrument the `ai` SDK. Supported are:
 * - v7 via native `ai:telemetry` tracing channel
 * - v6 via orchestrion `orchestrion:ai:*` channels
 */
export const vercelAiChannelIntegration = defineIntegration(_vercelAiChannelIntegration);
