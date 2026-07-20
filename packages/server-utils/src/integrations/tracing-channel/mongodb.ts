import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import type { MongodbNamespace, MongoV3Topology } from '../../mongodb/mongodb-span';
import {
  getV3CommandOperation,
  getV3SpanAttributes,
  getV4SpanAttributes,
  startMongoSpan,
} from '../../mongodb/mongodb-span';
import { CHANNELS } from '../../orchestrion/channels';
import { bindTracingChannelToSpan } from '../../tracing-channel';
import { invokeOrchestrionInstrumentation } from '../../orchestrion/instrumentation';
import { mongodbModuleNames } from '../../orchestrion/config/mongodb';

const INTEGRATION_NAME = 'Mongo' as const;

const ORIGIN = 'auto.db.orchestrion.mongo';

/**
 * what orchestrion's transform attaches to a channel context:
 * `self` is the `this`, plus args.
 */
interface MongoChannelContext {
  self?: { address?: string };
  arguments?: unknown[];
}

// Details extracted from a v3 wireprotocol call's arguments to build its span.
interface V3CallInfo {
  topology: MongoV3Topology | undefined;
  ns: string;
  command: Record<string, unknown> | undefined;
  operation: string | undefined;
}

function instrumentMongoDB(): void {
  subscribeV4Command();
  subscribeV4Checkout();
  subscribeV3Wireprotocol();
}

// Command doc first-keys whose span the `v3_command` channel must suppress.
// The `insert`/`update`/`remove`/`query`/`getMore` functions call the shared
// `command` function internally. Orchestrion transforms the `command` *source*
// (unlike the vendored OTel patch, which wraps the module's exported reference
// and misses internal calls), so `v3_command` would double-span the ones that
// already have their own dedicated channel (`v3_insert`/`update`/`remove`/
// `query`/`get_more`) without this guard.
//
// `killCursors` has no dedicated channel, but is suppressed too for OTel
// parity: OTel wraps `wireprotocol/index.js`'s `command` property, which never
// intercepts `kill_cursors.js`'s direct `require('./command')` call — so OTel
// emits no killCursors span, and neither should we.
const V3_DEDICATED_COMMANDS = new Set(['insert', 'update', 'delete', 'find', 'getMore', 'killCursors']);

const _mongodbChannelIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      invokeOrchestrionInstrumentation(client, mongodbModuleNames, instrumentMongoDB, []);
    },
  };
}) satisfies IntegrationFn;

/**
 * `Connection.prototype.command` (mongodb >=4.0) one span per command.
 * Handles both the >=6.4 promise form and the >=4.0 <6.4 callback form
 * (both publish to this channel).
 */
function subscribeV4Command(): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<MongoChannelContext>(CHANNELS.MONGODB_COMMAND),
    data => {
      const args = data.arguments ?? [];
      const ns = args[0] as MongodbNamespace | undefined;
      const cmd = args[1] as Record<string, unknown> | undefined;
      // Skip handshake/heartbeat commands (matches otel).
      if (!ns || !cmd || typeof cmd !== 'object' || cmd.ismaster || cmd.hello) {
        return undefined;
      }
      const operation = Object.keys(cmd)[0];
      return startMongoSpan(getV4SpanAttributes(data.self, ns, cmd, operation, ORIGIN));
    },
    // Matches otel's `shouldSkipInstrumentation`: only trace when there is
    // an active parent span, to avoid emitting orphaned mongodb spans.
    { requiresParentSpan: true },
  );
}

/**
 * `ConnectionPool.prototype.checkOut` (mongodb 4.0 - 6.3, callback form).
 * Creates no span (`getSpan` returns `undefined`) but the binding re-runs
 * the checkout callback under the caller's captured context, so the pooled
 * `command()` invoked inside it re-inherits the active span.
 */
function subscribeV4Checkout(): void {
  bindTracingChannelToSpan(diagnosticsChannel.tracingChannel(CHANNELS.MONGODB_CHECKOUT), () => undefined);
}

/**
 * mongodb >=3.3 <4 had no unified `command`; each operation is a separate
 * `lib/core/wireprotocol` function with its own argument layout, so each
 * channel extracts topology/namespace/command/op differently before building
 * the span.
 */
function subscribeV3Wireprotocol(): void {
  for (const operation of ['insert', 'update', 'remove'] as const) {
    const channel =
      operation === 'insert'
        ? CHANNELS.MONGODB_V3_INSERT
        : operation === 'update'
          ? CHANNELS.MONGODB_V3_UPDATE
          : CHANNELS.MONGODB_V3_REMOVE;
    bindV3(channel, args => ({
      topology: args[0] as MongoV3Topology | undefined,
      ns: args[1] as string,
      command: (args[2] as Record<string, unknown>[] | undefined)?.[0],
      operation,
    }));
  }

  // `command`(server, ns, cmd, options, callback) operation derived from the
  // command doc. Skips commands that have a dedicated channel. See set above.
  bindV3(CHANNELS.MONGODB_V3_COMMAND, args => {
    const command = args[2] as Record<string, unknown> | undefined;
    const type = command ? Object.keys(command)[0] : undefined;
    if (type && V3_DEDICATED_COMMANDS.has(type)) {
      return undefined;
    }
    return {
      topology: args[0] as MongoV3Topology | undefined,
      ns: args[1] as string,
      command,
      operation: command ? getV3CommandOperation(command) : undefined,
    };
  });

  // `query`(server, ns, cmd, cursorState, options, callback). a find.
  bindV3(CHANNELS.MONGODB_V3_QUERY, args => ({
    topology: args[0] as MongoV3Topology | undefined,
    ns: args[1] as string,
    command: args[2] as Record<string, unknown> | undefined,
    operation: 'find',
  }));

  // `getMore`(server, ns, cursorState, batchSize, options, callback)
  // command doc is `cursorState.cmd`.
  bindV3(CHANNELS.MONGODB_V3_GET_MORE, args => ({
    topology: args[0] as MongoV3Topology | undefined,
    ns: args[1] as string,
    command: (args[2] as { cmd?: Record<string, unknown> } | undefined)?.cmd,
    operation: 'getMore',
  }));
}

function bindV3(channelName: string, extract: (args: unknown[]) => V3CallInfo | undefined): void {
  bindTracingChannelToSpan(
    diagnosticsChannel.tracingChannel<MongoChannelContext>(channelName),
    data => {
      const args = data.arguments;
      if (!args) {
        return undefined;
      }
      const info = extract(args);
      if (!info || typeof info.ns !== 'string') {
        return undefined;
      }
      return startMongoSpan(getV3SpanAttributes(info.ns, info.topology, info.command, info.operation, ORIGIN));
    },
    { requiresParentSpan: true },
  );
}

/**
 * EXPERIMENTAL: orchestrion-driven mongodb integration.
 *
 * Reproduces the vendored `@opentelemetry/instrumentation-mongodb` span shape
 * (legacy db/net semantic conventions, `mongodb.<op>` names, scrubbed
 * `db.statement`) via the `orchestrion:mongodb:*` diagnostics_channels
 * injected by the orchestrion code transform.
 */
export const mongodbChannelIntegration = defineIntegration(_mongodbChannelIntegration);
