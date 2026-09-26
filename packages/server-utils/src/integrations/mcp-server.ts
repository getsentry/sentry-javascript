import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { wrapMcpServerWithSentry } from '@sentry/core/server';
import { CHANNELS } from '../orchestrion/channels';
import { mcpServerModuleNames } from '../orchestrion/config/mcp-server';
import { invokeOrchestrionInstrumentation } from '../orchestrion/instrumentation';
import { safeChannelCallback } from '../tracing-channel';

const INTEGRATION_NAME = 'McpServer';

interface ConstructorChannelContext {
  arguments: unknown[];
  self?: unknown;
}

const _mcpServerIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      // `wrapMcpServerWithSentry` only patches methods on the freshly-built instance; it opens no
      // spans itself (those come later from the wrapped transport), so a missing async-context
      // binding must not defer the subscription.
      invokeOrchestrionInstrumentation(client, mcpServerModuleNames, subscribe, [], {
        requiresTracingChannelBinding: false,
      });
    },
  };
}) satisfies IntegrationFn;

function subscribe(): void {
  // Wrap each newly-constructed `McpServer` the moment its constructor returns. This is the
  // automatic equivalent of a user calling `wrapMcpServerWithSentry(new McpServer(...))`; the
  // wrap's own `WeakSet` guard makes a later manual call on the same instance a no-op, so the two
  // paths coexist safely.
  for (const channel of [CHANNELS.MCP_SERVER_V2_CONSTRUCTOR, CHANNELS.MCP_SERVER_V1_CONSTRUCTOR]) {
    diagnosticsChannel.tracingChannel<ConstructorChannelContext>(channel).end.subscribe(message => {
      safeChannelCallback(() => {
        const { self } = message as ConstructorChannelContext;
        if (self) {
          wrapMcpServerWithSentry(self);
        }
      });
    });
  }
}

/**
 * Auto-instruments `@modelcontextprotocol/server` (v2) and `@modelcontextprotocol/sdk` (v1)
 * `McpServer` instances, so users no longer have to wrap them with `wrapMcpServerWithSentry`
 * by hand. Enabled by default. Requires the runtime hook or a bundler plugin (orchestrion) to
 * inject the constructor channel.
 */
export const mcpServerIntegration = defineIntegration(_mcpServerIntegration);
