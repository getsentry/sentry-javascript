import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { addBreadcrumb, debug, defineIntegration } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

/**
 * The `agents` framework's own `node:diagnostics_channel` channels. Unlike the orchestrion
 * subscribers (where the bundler injects `tracingChannel` calls into libraries that don't publish
 * natively), `agents` publishes plain point-in-time events to these channels itself — so we only
 * need the subscribe side.
 */
const AGENT_CHANNELS = [
  'agents:state',
  'agents:rpc',
  'agents:message',
  'agents:chat',
  'agents:transcript',
  'agents:fiber',
  'agents:agent_tool',
  'agents:schedule',
  'agents:lifecycle',
  'agents:workflow',
  'agents:mcp',
  'agents:email',
  'agents:channel',
] as const;

interface AgentChannelEvent {
  type?: string;
  agent?: string;
  name?: string;
  payload?: Record<string, unknown>;
}

let subscribed = false;

const _agentsDiagnosticsChannelIntegration = (() => {
  return {
    name: 'AgentsDiagnosticsChannel',
    setupOnce() {
      // `init()` runs per request in workerd; subscribe only once per isolate.
      if (subscribed) {
        return;
      }
      subscribed = true;

      for (const channelName of AGENT_CHANNELS) {
        DEBUG_BUILD && debug.log(`[orchestrion:agents] subscribing to channel "${channelName}"`);
        diagnosticsChannel.subscribe(channelName, event => {
          try {
            const { type, agent, name, payload } = (event ?? {}) as AgentChannelEvent;
            if (!type) {
              return;
            }

            addBreadcrumb({
              category: `agent.${type}`,
              level: type.endsWith(':error') ? 'error' : 'info',
              // The channel event carries the agent class and instance name itself, so no instance
              // access is needed (unlike the `_emit` wrap).
              data: { agent, name, ...payload },
            });
          } catch {
            // Recording a breadcrumb must never break the Agent's event flow.
          }
        });
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Subscribes to the `agents` framework's `node:diagnostics_channel` observability channels and
 * records a breadcrumb per event. Non-invasive (no method patching) and not tied to a specific
 * instrumented instance, but it relies on in-process channel subscription reaching the Durable
 * Object's isolate.
 */
export const agentsDiagnosticsChannelIntegration = defineIntegration(_agentsDiagnosticsChannelIntegration);
