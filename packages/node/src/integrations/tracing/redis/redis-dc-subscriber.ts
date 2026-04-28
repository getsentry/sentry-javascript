import type { Span } from '@opentelemetry/api';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startSpanManual,
} from '@sentry/core';
import { tracingChannel, type TracingChannelContextWithSpan } from '@sentry/opentelemetry/tracing-channel';
import { defaultDbStatementSerializer } from './vendored/redis-common';
import {
  ATTR_DB_STATEMENT,
  ATTR_DB_SYSTEM,
  ATTR_NET_PEER_NAME,
  ATTR_NET_PEER_PORT,
  DB_SYSTEM_VALUE_REDIS,
} from './vendored/semconv';
import type { IORedisInstrumentationConfig } from './vendored/types';

// Channel names as published by node-redis >= 5.12.0.
// Hardcoded so we don't import `redis` at module-load time.
const CHANNEL_COMMAND = 'node-redis:command';
const CHANNEL_BATCH = 'node-redis:batch';
const CHANNEL_CONNECT = 'node-redis:connect';

const ORIGIN = 'auto.db.redis.diagnostic-channel';

interface CommandData {
  command: string;
  args: Array<string | Buffer>;
  database?: number;
  serverAddress?: string;
  serverPort?: number;
  result?: unknown;
  error?: Error;
}

interface BatchData {
  batchMode?: 'MULTI' | 'PIPELINE';
  batchSize?: number;
  database?: number;
  clientId?: string | number;
  serverAddress?: string;
  serverPort?: number;
  result?: unknown[];
  error?: Error;
}

interface ConnectData {
  serverAddress?: string;
  serverPort?: number;
  url?: string;
  error?: Error;
}

const NOOP = (): void => {};

let subscribed = false;
let currentResponseHook: IORedisInstrumentationConfig['responseHook'] | undefined;

/**
 * Subscribe Sentry handlers to node-redis diagnostics_channel events (>= 5.12.0).
 *
 * Uses `@sentry/opentelemetry/tracing-channel` so OTel AsyncLocalStorage context propagates
 * automatically via `bindStore` — without it, spans created in `start` would not become
 * the active context for subsequent operations.
 *
 * Safe on every runtime that exposes `node:diagnostics_channel` (Node, Bun, Deno, Workers).
 * In node-redis < 5.12.0 the channels are never published to, so subscribers are inert and
 * there is no double-instrumentation against the IITM-based patcher (gated to < 5.12.0).
 */
export function subscribeRedisDiagnosticChannels(responseHook?: IORedisInstrumentationConfig['responseHook']): void {
  currentResponseHook = responseHook;
  if (subscribed) return;

  try {
    setupCommandChannel();
    setupBatchChannel();
    setupConnectChannel();
    subscribed = true;
  } catch {
    // tracingChannel from @sentry/opentelemetry requires `node:diagnostics_channel`.
    // On runtimes where it isn't available, fail closed.
  }
}

function setupCommandChannel(): void {
  const channel = tracingChannel<CommandData>(CHANNEL_COMMAND, data => {
    const statement = safeSerialize(data.command, data.args);
    return startSpanManual(
      {
        name: `redis-${data.command}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          ...(statement != null ? { [ATTR_DB_STATEMENT]: statement } : {}),
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    ) as Span;
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      const span = data._sentrySpan;
      if (!span) return;
      runResponseHook(span, data.command, data.args, data.result);
      span.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function setupBatchChannel(): void {
  const channel = tracingChannel<BatchData>(CHANNEL_BATCH, data => {
    const operationName = data.batchMode === 'PIPELINE' ? 'PIPELINE' : 'MULTI';

    return startSpanManual(
      {
        name: operationName,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          ...(data.batchSize != null ? { 'db.redis.batch_size': data.batchSize } : {}),
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    ) as Span;
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      data._sentrySpan?.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function setupConnectChannel(): void {
  const channel = tracingChannel<ConnectData>(CHANNEL_CONNECT, data => {
    return startSpanManual(
      {
        name: 'redis-connect',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db.redis.connect',
          [ATTR_DB_SYSTEM]: DB_SYSTEM_VALUE_REDIS,
          ...(data.serverAddress != null ? { [ATTR_NET_PEER_NAME]: data.serverAddress } : {}),
          ...(data.serverPort != null ? { [ATTR_NET_PEER_PORT]: data.serverPort } : {}),
        },
      },
      span => span,
    ) as Span;
  });

  channel.subscribe({
    start: NOOP,
    asyncStart: NOOP,
    end: NOOP,
    asyncEnd: data => {
      data._sentrySpan?.end();
    },
    error: data => {
      const span = data._sentrySpan;
      if (!span) return;
      if (data.error) {
        span.setStatus({ code: SPAN_STATUS_ERROR, message: data.error.message });
      }
      span.end();
    },
  });
}

function runResponseHook(span: Span, command: string, args: Array<string | Buffer>, result: unknown): void {
  const hook = currentResponseHook;
  if (!hook) return;
  try {
    hook(span, command, args as unknown as Parameters<typeof hook>[2], result);
  } catch {
    // never let user hooks break instrumentation
  }
}

function safeSerialize(command: string, args: Array<string | Buffer>): string | undefined {
  try {
    return defaultDbStatementSerializer(command, args);
  } catch {
    return undefined;
  }
}

// Test-only helper.
export function _resetRedisDiagnosticChannelsForTesting(): void {
  subscribed = false;
  currentResponseHook = undefined;
}

// Suppress unused-import lint when only used in types.
export type { TracingChannelContextWithSpan };
