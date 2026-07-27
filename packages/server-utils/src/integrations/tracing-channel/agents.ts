import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import {
  debug,
  defineIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  startInactiveSpan,
  waitForTracingChannelBinding,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';

const INTEGRATION_NAME = 'Agents' as const;

// Matches the `instrumentAgentWithSentry` method-wrap spans, so the output is identical whether the
// spans come from orchestrion channel injection or the monkey-patch fallback.
const ORIGIN = 'auto.faas.cloudflare.agents';
const ATTR_SCHEDULE_ID = 'cloudflare.agent.schedule.id';
const ATTR_FIBER_ID = 'cloudflare.agent.fiber.id';
const ATTR_FIBER_NAME = 'cloudflare.agent.fiber.name';

interface AgentsChannelContext {
  arguments: unknown[];
  result?: unknown;
  error?: unknown;
}

let subscribed = false;

const _agentsChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // `tracingChannel` is unavailable on older runtimes, and a second `init()` would double-subscribe.
      if (!diagnosticsChannel.tracingChannel || subscribed) {
        return;
      }
      subscribed = true;

      waitForTracingChannelBinding(() => {
        // `Agent._executeScheduleCallback(row)` → one `function` span per scheduled-task execution.
        DEBUG_BUILD &&
          debug.log(`[orchestrion:agents] subscribing to channel "${CHANNELS.AGENTS_EXECUTE_SCHEDULE_CALLBACK}"`);
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<AgentsChannelContext>(CHANNELS.AGENTS_EXECUTE_SCHEDULE_CALLBACK),
          data => {
            const row = data.arguments[0] as { id?: unknown; callback?: unknown } | undefined;
            const callback = typeof row?.callback === 'string' && row.callback ? row.callback : undefined;

            if (!callback) {
              return undefined;
            }

            const attributes: Record<string, string> = {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            };
            if (typeof row?.id === 'string' && row.id) {
              attributes[ATTR_SCHEDULE_ID] = row.id;
            }

            return startInactiveSpan({ name: callback, attributes });
          },
        );

        // `Agent._runFiberInternal(id, name, fn)` → one `function` span per managed fiber run.
        DEBUG_BUILD && debug.log(`[orchestrion:agents] subscribing to channel "${CHANNELS.AGENTS_RUN_FIBER}"`);
        bindTracingChannelToSpan(
          diagnosticsChannel.tracingChannel<AgentsChannelContext>(CHANNELS.AGENTS_RUN_FIBER),
          data => {
            const [id, name] = data.arguments as [unknown, unknown, ...unknown[]];

            const attributes: Record<string, string> = {
              [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'function',
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
            };
            if (typeof id === 'string' && id) {
              attributes[ATTR_FIBER_ID] = id;
            }
            if (typeof name === 'string' && name) {
              attributes[ATTR_FIBER_NAME] = name;
            }

            return startInactiveSpan({ name: typeof name === 'string' && name ? name : 'fiber', attributes });
          },
        );
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Subscribes to the orchestrion channels injected into the `agents` package's `_executeScheduleCallback`
 * and `_runFiberInternal` methods, producing the same schedule-task and fiber spans that
 * `instrumentAgentWithSentry` creates via method-wrapping. Used when the orchestrion bundler plugin
 * instrumented `agents` (detected via `__SENTRY_ORCHESTRION__.bundler`).
 */
export const agentsChannelIntegration = defineIntegration(_agentsChannelIntegration);
