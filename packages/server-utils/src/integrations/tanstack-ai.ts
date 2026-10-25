import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, isObjectLike } from '@sentry/core';
import type { TanstackAiOptions } from '../ai/tanstack-ai';
import { createTanstackAiMiddleware } from '../ai/tanstack-ai';
import { TANSTACK_AI_INTEGRATION_NAME, TANSTACK_AI_MIDDLEWARE_BRAND } from '../ai/tanstack-ai/constants';
import type { TanstackAiGenerationActivity } from '../ai/tanstack-ai/generation';
import {
  setGenerationEndAttributes,
  setGenerationResponseAttributes,
  startGenerationSpan,
  TANSTACK_AI_DECIDE,
  TANSTACK_AI_EMBED,
  TANSTACK_AI_RERANK,
} from '../ai/tanstack-ai/generation';
import { skipProviderIntegrations } from '../ai/tanstack-ai/utils';
import { CHANNELS } from '../orchestrion/channels';
import { tanstackAiModuleNames } from '../orchestrion/config/tanstack-ai';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { bindTracingChannelToSpan, safeChannelCallback } from '../tracing-channel';

const GENERATION_ACTIVITIES: Array<[channel: string, activity: TanstackAiGenerationActivity]> = [
  [CHANNELS.TANSTACK_AI_EMBED, TANSTACK_AI_EMBED],
  [CHANNELS.TANSTACK_AI_RERANK, TANSTACK_AI_RERANK],
  [CHANNELS.TANSTACK_AI_DECIDE, TANSTACK_AI_DECIDE],
];

const _tanstackAiIntegration = ((options: TanstackAiOptions = {}) => {
  return {
    name: TANSTACK_AI_INTEGRATION_NAME,
    setup(client) {
      // Injecting the middleware opens no span; the middleware parents its spans explicitly.
      invokeOrchestrionInstrumentation(client, tanstackAiModuleNames, injectMiddleware, [options], {
        requiresTracingChannelBinding: false,
      });
      // The other activities open their own spans via `bindTracingChannelToSpan`, which needs the binding.
      invokeOrchestrionInstrumentation(client, tanstackAiModuleNames, instrumentGenerationActivities, [options]);
    },
  };
}) satisfies IntegrationFn;

/**
 * Add our middleware to every `chat()` call that does not already carry one, and skip the integrations of
 * the vendor SDKs during the calls of the adapter.
 */
function injectMiddleware(options: TanstackAiOptions): void {
  const middleware = createTanstackAiMiddleware(options);

  diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.TANSTACK_AI_CHAT).start.subscribe(message => {
    safeChannelCallback(() => {
      const data = message as OrchestrionChannelContext;
      const chatOptions = data.arguments[0];
      if (!isObjectLike(chatOptions)) {
        return;
      }
      const existing = chatOptions.middleware;
      // `chat()` throws on a non-array itself; leave that error to it.
      if (existing !== undefined && !Array.isArray(existing)) {
        return;
      }
      const hasOurMiddleware = existing?.some(entry => isObjectLike(entry) && entry[TANSTACK_AI_MIDDLEWARE_BRAND]);
      // A copy, so options the app reuses across calls do not collect one middleware per call.
      data.arguments[0] = {
        ...chatOptions,
        adapter: skipProviderIntegrations(chatOptions.adapter),
        ...(hasOurMiddleware ? {} : { middleware: [...(existing ?? []), middleware] }),
      };
    });
  });
}

/** Record a span for each call of the activities other than `chat()`, active while the call runs. */
function instrumentGenerationActivities(options: TanstackAiOptions): void {
  for (const [channel, activity] of GENERATION_ACTIVITIES) {
    bindTracingChannelToSpan(
      diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(channel),
      data => {
        const callOptions = data.arguments[0];
        const span = startGenerationSpan(activity, callOptions, options);
        // Only a call that our span records skips the integrations of the vendor SDKs.
        if (span && isObjectLike(callOptions)) {
          data.arguments[0] = {
            ...callOptions,
            adapter: skipProviderIntegrations(callOptions.adapter, {
              method: activity.adapterMethod,
              callback: adapterResult =>
                safeChannelCallback(() => setGenerationResponseAttributes(span, activity, adapterResult)),
            }),
          };
        }
        return span;
      },
      { beforeSpanEnd: (span, data) => setGenerationEndAttributes(span, activity, data, options) },
    );
  }
}

export const tanstackAiIntegration = defineIntegration(_tanstackAiIntegration);
