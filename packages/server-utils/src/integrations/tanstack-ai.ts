import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { consoleSandbox, defineIntegration, isObjectLike } from '@sentry/core';
import type { TanstackAIOptions } from '../ai/tanstack-ai';
import { createTanstackAIMiddleware } from '../ai/tanstack-ai';
import { TANSTACK_AI_INTEGRATION_NAME, TANSTACK_AI_MIDDLEWARE_BRAND } from '../ai/tanstack-ai/constants';
import { CHANNELS } from '../orchestrion/channels';
import { tanstackAiModuleNames } from '../orchestrion/config/tanstack-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { safeChannelCallback } from '../tracing-channel';

const _tanstackAIIntegration = ((options: TanstackAIOptions = {}) => {
  return {
    name: TANSTACK_AI_INTEGRATION_NAME,
    setup(client) {
      // Adding the middleware starts no span, so the subscription does not need the binding.
      invokeOrchestrionInstrumentation(client, tanstackAiModuleNames, instrumentTanstackAI, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

let warnedOtelMiddleware = false;

function instrumentTanstackAI(options: TanstackAIOptions): void {
  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.TANSTACK_AI_CHAT).start.subscribe(message => {
    safeChannelCallback(() => {
      const data = message as OrchestrionChannelContext;
      const call = data.arguments[0];
      if (!isObjectLike(call)) {
        return;
      }
      const existing = call.middleware;
      // `chat()` throws for middleware that is not an array. Leave that error to it.
      if (existing !== undefined && !Array.isArray(existing)) {
        return;
      }
      if (existing?.some(entry => isObjectLike(entry) && entry[TANSTACK_AI_MIDDLEWARE_BRAND])) {
        return;
      }
      if (existing?.some(entry => isObjectLike(entry) && entry.name === 'otel')) {
        warnOtelMiddleware();
      }
      // Last, so that it records the config and the chunks after the other middleware changed them.
      // A copy, so that options which the app uses again do not collect one middleware per call.
      data.arguments[0] = {
        ...call,
        middleware: [...(existing ?? []), createTanstackAIMiddleware(options, call)],
      };
    });
  });
}

function warnOtelMiddleware(): void {
  if (warnedOtelMiddleware) {
    return;
  }
  warnedOtelMiddleware = true;
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      "[Sentry] `tanstackAIIntegration` is active and a `chat()` call also uses TanStack's otelMiddleware, so each run is recorded twice. Remove otelMiddleware to avoid duplicate spans.",
    );
  });
}

/**
 * Traces the `chat()` calls of TanStack AI (`@tanstack/ai` >= 1.0.0 < 2), through the
 * `orchestrion:@tanstack/ai:chat` channel. Each call gets a `gen_ai.invoke_agent` span, with a
 * `gen_ai.chat` span for each model call and a `gen_ai.execute_tool` span for each tool run.
 * Needs the Sentry runtime hook (`--import`) or bundler plugin.
 *
 * @example
 * ```javascript
 * Sentry.init({
 *   integrations: [Sentry.tanstackAIIntegration({ recordInputs: true, recordOutputs: true })],
 * });
 * ```
 */
export const tanstackAIIntegration = defineIntegration(_tanstackAIIntegration);
