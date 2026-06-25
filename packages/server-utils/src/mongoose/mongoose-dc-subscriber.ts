import type { TracingChannel } from 'node:diagnostics_channel';
import {
  DB_COLLECTION_NAME,
  DB_NAMESPACE,
  DB_OPERATION_BATCH_SIZE,
  DB_OPERATION_NAME,
  DB_QUERY_TEXT,
  DB_SYSTEM_NAME,
  SERVER_ADDRESS,
  SERVER_PORT,
} from '@sentry/conventions/attributes';
import { debug, SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, startInactiveSpan } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { bindTracingChannelToSpan } from '../tracing-channel';

// Channel names published by mongoose >= 9.7.0 (see mongoose `lib/tracing.js`,
// `lib/query.js`, `lib/aggregate.js`, `lib/model.js` and `lib/cursor/*`).
// Hardcoded so the subscriber does not have to import mongoose — the channels
// just have to be subscribed to before the user's mongoose code publishes.
export const MONGOOSE_DC_CHANNEL_QUERY = 'mongoose:query';
export const MONGOOSE_DC_CHANNEL_AGGREGATE = 'mongoose:aggregate';
export const MONGOOSE_DC_CHANNEL_MODEL_SAVE = 'mongoose:model:save';
export const MONGOOSE_DC_CHANNEL_MODEL_INSERT_MANY = 'mongoose:model:insertMany';
export const MONGOOSE_DC_CHANNEL_MODEL_BULK_WRITE = 'mongoose:model:bulkWrite';
export const MONGOOSE_DC_CHANNEL_CURSOR_NEXT = 'mongoose:cursor:next';

const ORIGIN = 'auto.db.mongoose.diagnostic_channel';
const DB_SYSTEM_NAME_VALUE_MONGODB = 'mongodb';

// Cap recursion so a self-referential or pathologically deep query can never
// stall (or blow the stack in) instrumentation.
const MAX_REDACTION_DEPTH = 10;

/**
 * Shape of the context object mongoose >= 9.7.0 publishes on its tracing
 * channels (mongoose's `TracingContext`, see `types/tracing.d.ts`).
 *
 * Node's `tracePromise` mutates this same object with `result`/`error` once the
 * operation settles, which `bindTracingChannelToSpan` reads in its lifecycle
 * handlers — hence both are declared optional here.
 *
 * Unlike redis/ioredis, mongoose does NOT pre-sanitize the payload, so `args`
 * carries the raw user query. We redact it before emitting `db.query.text`.
 */
export interface MongooseTracingData {
  operation: string;
  /** Absent for connection-level `aggregate()` calls, which have no model/collection. */
  collection?: string;
  database?: string;
  serverAddress?: string;
  serverPort?: number;
  /** Cursor channels only: the cursor's fetch batch size and tailable flag. */
  batchSize?: number;
  tailable?: boolean;
  /**
   * Operation-specific arguments. `filter` (queries/cursors) and `pipeline`
   * (aggregations) carry the query shape; `docs`/`ops` carry batch payloads.
   */
  args?: {
    filter?: unknown;
    pipeline?: unknown;
    docs?: unknown;
    ops?: unknown;
    [key: string]: unknown;
  };
  result?: unknown;
  error?: Error;
}

/**
 * Platform-provided factory that creates a native tracing channel for the given name. The
 * subscriber binds the span and its lifecycle onto the channel via `bindTracingChannelToSpan`,
 * which propagates the active span through the runtime's async context.
 *
 * Node passes `node:diagnostics_channel`'s `tracingChannel` directly.
 */
export type MongooseTracingChannelFactory = <T extends object>(name: string) => TracingChannel<T, T>;

let subscribed = false;

/**
 * Subscribe Sentry span handlers to mongoose's diagnostics-channel events
 * (`mongoose:query`, `:aggregate`, `:model:save`, `:model:insertMany`,
 * `:model:bulkWrite`, `:cursor:next`), published by mongoose >= 9.7.0.
 *
 * On older mongoose versions the channels are never published to, so the
 * subscribers are inert — there is no double-instrumentation against the
 * IITM-based vendored patcher, which is gated to `< 9.7.0`.
 *
 * Idempotent: subsequent calls are a no-op.
 */
export function subscribeMongooseDiagnosticChannels(tracingChannel: MongooseTracingChannelFactory): void {
  if (subscribed) {
    return;
  }
  subscribed = true;

  try {
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_QUERY);
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_AGGREGATE);
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_MODEL_SAVE);
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_MODEL_INSERT_MANY);
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_MODEL_BULK_WRITE);
    setupChannel(tracingChannel, MONGOOSE_DC_CHANNEL_CURSOR_NEXT);
  } catch {
    // The factory relies on `node:diagnostics_channel`, which isn't always
    // available. Fail closed; the SDK simply won't emit mongoose spans here.
    DEBUG_BUILD && debug.log('Mongoose node:diagnostics_channel subscription failed.');
  }
}

function setupChannel(tracingChannel: MongooseTracingChannelFactory, channelName: string): void {
  bindTracingChannelToSpan(tracingChannel<MongooseTracingData>(channelName), data => {
    const collection = data.collection;
    const queryText = redactMongoQuery(data.args?.pipeline ?? data.args?.filter);
    const batchSize = getBatchSize(data);

    return startInactiveSpan({
      name: collection ? `mongoose.${collection}.${data.operation}` : `mongoose.${data.operation}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: ORIGIN,
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
        [DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_MONGODB,
        [DB_OPERATION_NAME]: data.operation,
        ...(collection != null ? { [DB_COLLECTION_NAME]: collection } : {}),
        ...(data.database != null ? { [DB_NAMESPACE]: data.database } : {}),
        ...(queryText != null ? { [DB_QUERY_TEXT]: queryText } : {}),
        ...(batchSize != null ? { [DB_OPERATION_BATCH_SIZE]: batchSize } : {}),
        ...(data.serverAddress != null ? { [SERVER_ADDRESS]: data.serverAddress } : {}),
        ...(data.serverPort != null ? { [SERVER_PORT]: data.serverPort } : {}),
      },
    });
  });
}

/**
 * `db.operation.batch.size` is only meaningful for genuine batch operations.
 * Mongoose's cursor `batchSize` is a fetch-tuning option, not a batch operation
 * size, so it is intentionally excluded here.
 */
function getBatchSize(data: MongooseTracingData): number | undefined {
  const args = data.args;
  const batch = data.operation === 'insertMany' ? args?.docs : data.operation === 'bulkWrite' ? args?.ops : undefined;
  return Array.isArray(batch) && batch.length > 1 ? batch.length : undefined;
}

/**
 * Serialize a mongoose filter/pipeline into `db.query.text` while stripping every
 * value: keys and Mongo operators (`$gt`, `$in`, …) are preserved, leaf values
 * become `'?'`. Mongoose does not sanitize its channel payload, so this prevents
 * raw user data (potential PII) from leaving the process. Returns `undefined`
 * (rather than throwing) on anything it cannot serialize.
 */
function redactMongoQuery(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  try {
    const redacted = redactValue(value, 0);
    const text = JSON.stringify(redacted);
    // Skip empty/uninformative shapes (e.g. a `findOne()` with no filter).
    return text == null || text === '{}' || text === '[]' ? undefined : text;
  } catch {
    return undefined;
  }
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_REDACTION_DEPTH) {
    return '?';
  }

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = redactValue((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return '?';
}
