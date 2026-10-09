import * as diagnosticsChannel from '../utils/diagnosticsChannel';
import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, isObjectLike } from '@sentry/core';
import type { PiDurableOptions } from '../ai/pi-durable';
import { endRunsOnClose, instrumentPiDurableHarnessOptions } from '../ai/pi-durable';
import { PI_DURABLE_INTEGRATION_NAME } from '../ai/pi-durable/constants';
import { markBuiltInTool } from '../ai/pi-durable/tools';
import type { PiHarnessOptions } from '../ai/pi-durable/types';
import { DEBUG_BUILD } from '../debug-build';
import type { OrchestrionChannelContext } from '../orchestrion/types';
import { CHANNELS } from '../orchestrion/channels';
import { piDurableModuleNames } from '../orchestrion/config/pi-durable';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';

const _piDurableIntegration = ((options: PiDurableOptions = {}) => {
  return {
    name: PI_DURABLE_INTEGRATION_NAME,
    setup(client) {
      // Subscribing opens no span; spans open later, inside task phases.
      invokeOrchestrionInstrumentation(client, piDurableModuleNames, instrumentPiDurable, [options], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function instrumentPiDurable(options: PiDurableOptions): void {
  const harnessOpen = diagnosticsChannel.tracingChannel<OrchestrionChannelContext>(CHANNELS.PI_DURABLE_HARNESS_OPEN);

  harnessOpen.start.subscribe(message => {
    const args = (message as OrchestrionChannelContext).arguments;
    try {
      if (args && isObjectLike(args[1])) {
        args[1] = instrumentPiDurableHarnessOptions(args[1] as PiHarnessOptions, options);
      }
    } catch (error) {
      DEBUG_BUILD && debug.error('[instrumentation:pi-durable] failed to instrument Harness options', error);
    }
  });

  harnessOpen.asyncEnd.subscribe(message => {
    const { arguments: args, result } = message as OrchestrionChannelContext;
    try {
      if (args && isObjectLike(args[1])) {
        endRunsOnClose(args[1], result);
      }
    } catch (error) {
      DEBUG_BUILD && debug.error('[instrumentation:pi-durable] failed to observe Harness close', error);
    }
  });

  diagnosticsChannel
    .tracingChannel<OrchestrionChannelContext>(CHANNELS.PI_DURABLE_CODING_TOOL)
    .end.subscribe(message => markBuiltInTool((message as OrchestrionChannelContext).result));
}

/**
 * Diagnostics-channel-based integration for pi-durable (`@earendil-works/pi-durable` >= 1.0.0 < 2,
 * whose API is experimental). Subscribes to the `orchestrion:@earendil-works/pi-durable:harnessOpen`
 * channel injected into `Harness.open()` and to the `codingTool` channel injected into the built-in
 * tool factories, so it requires the Sentry runtime hook or bundler plugin.
 *
 * Traces one `gen_ai.invoke_agent` span per run, with its model requests as `gen_ai.chat` and its
 * tool calls as `gen_ai.execute_tool` children. From the first model request on, the `openai`,
 * `@anthropic-ai/sdk`, `@google/genai` and Workers AI integrations stop reporting requests in the
 * whole process, because pi-ai sends its requests through those clients.
 */
export const piDurableIntegration = defineIntegration(_piDurableIntegration);
