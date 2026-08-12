import type { Client, IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { vercelAIIntegration as baseVercelAIIntegration } from '../vercel-ai';
import * as dc from 'node:diagnostics_channel';
import { vercelAiModuleNames } from '../orchestrion/config/vercel-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { subscribeVercelAiOrchestrionChannels } from '../vercel-ai/vercel-ai-orchestrion-subscriber';

type VercelAiOptions = Parameters<typeof baseVercelAIIntegration>[0];

// In channel-based (orchestrion) mode we emit our own `gen_ai.*` spans from the
// diagnostics channels. The `ai` SDK would otherwise emit its own native
// OpenTelemetry spans whenever the user enables `experimental_telemetry`, which
// would be duplicates. Rather than dropping those after the fact, the v6
// subscriber suppresses them at the source: it flips the wrapped call's
// `experimental_telemetry.isEnabled` to `false`, so `ai` falls back to its
// internal no-op tracer and never creates the native spans in the first place.
// See `subscribeVercelAiOrchestrionChannels`.
const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  const parentIntegration = baseVercelAIIntegration(options);

  // The native `ai:telemetry` half is the base integration's own `setupOnce`; the
  // orchestrion half registers lazily via `setup`, only once `ai` is injected.
  return extendIntegration(parentIntegration, {
    options,
    setup(client: Client) {
      invokeOrchestrionInstrumentation(client, vercelAiModuleNames, instrumentVercelAiOrchestrion, [options]);
    },
  });
}) satisfies IntegrationFn;

function instrumentVercelAiOrchestrion(options: VercelAiOptions): void {
  subscribeVercelAiOrchestrionChannels(dc.tracingChannel, options);
}

/**
 * Auto-instrument the `ai` SDK. Supported are:
 * - v7 via native `ai:telemetry` tracing channel
 * - v4, v5 & v6 via orchestrion `orchestrion:ai:*` channels
 */
export const vercelAIIntegration = defineIntegration(_vercelAIIntegration);
