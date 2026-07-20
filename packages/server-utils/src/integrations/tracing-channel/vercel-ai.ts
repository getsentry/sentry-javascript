import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, extendIntegration } from '@sentry/core';
import { vercelAiIntegration as baseVercelAiIntegration } from '../../vercel-ai';
import { instrumentVercelAi } from '../../vercel-ai/vercel-ai-orchestrion-subscriber';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { vercelAiModuleNames } from '../../orchestrion/config/vercel-ai';

type VercelAiOptions = Parameters<typeof baseVercelAiIntegration>[0];

// In channel-based (orchestrion) mode we emit our own `gen_ai.*` spans from the
// diagnostics channels. The `ai` SDK would otherwise emit its own native
// OpenTelemetry spans whenever the user enables `experimental_telemetry`, which
// would be duplicates. Rather than dropping those after the fact, the v6
// subscriber suppresses them at the source: it flips the wrapped call's
// `experimental_telemetry.isEnabled` to `false`, so `ai` falls back to its
// internal no-op tracer and never creates the native spans in the first place.
const _vercelAiChannelIntegration = ((options: VercelAiOptions = {}) => {
  const parentIntegration = baseVercelAiIntegration(options);

  return extendIntegration(parentIntegration, {
    options,
    setup(client) {
      invokeOrchestrionInstrumentation(client, vercelAiModuleNames, instrumentVercelAi, [options]);
    },
  });
}) satisfies IntegrationFn;

/**
 * Auto-instrument the `ai` SDK. Supported are:
 * - v7 via native `ai:telemetry` tracing channel
 * - v4, v5 & v6 via orchestrion `orchestrion:ai:*` channels
 */
export const vercelAiChannelIntegration = defineIntegration(_vercelAiChannelIntegration);
