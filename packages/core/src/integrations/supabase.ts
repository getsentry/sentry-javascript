// Based on Kamil Ogórek's work on:
// https://github.com/supabase-community/sentry-integration-js

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines */
import { addBreadcrumb } from '../breadcrumbs';
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { captureException } from '../exports';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { setHttpStatus, SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../tracing';
import {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
} from '../tracing/dynamicSamplingContext';
import type { IntegrationFn } from '../types-hoist/integration';
import type { Span, SpanAttributes } from '../types-hoist/span';
import { dynamicSamplingContextToSentryBaggageHeader } from '../utils/baggage';
import { debug } from '../utils/debug-logger';
import { isPlainObject } from '../utils/is';
import { addExceptionMechanism } from '../utils/misc';
import { spanToTraceContext, spanToTraceHeader } from '../utils/spanUtils';
import { timestampInSeconds } from '../utils/time';
import { extractTraceparentData } from '../utils/tracing';

export interface SupabaseClientConstructorType {
  prototype: {
    from: (table: string) => PostgRESTQueryBuilder;
    schema: (schema: string) => { rpc: (...args: unknown[]) => Promise<unknown> };
    rpc: (...args: unknown[]) => Promise<unknown>;
  };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
}

const AUTH_OPERATIONS_TO_INSTRUMENT = [
  'reauthenticate',
  'signInAnonymously',
  'signInWithOAuth',
  'signInWithIdToken',
  'signInWithOtp',
  'signInWithPassword',
  'signInWithSSO',
  'signOut',
  'signUp',
  'verifyOtp',
];

const AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT = [
  'createUser',
  'deleteUser',
  'listUsers',
  'getUserById',
  'updateUserById',
  'inviteUserByEmail',
];

export const FILTER_MAPPINGS = {
  eq: 'eq',
  neq: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  like: 'like',
  'like(all)': 'likeAllOf',
  'like(any)': 'likeAnyOf',
  ilike: 'ilike',
  'ilike(all)': 'ilikeAllOf',
  'ilike(any)': 'ilikeAnyOf',
  is: 'is',
  in: 'in',
  cs: 'contains',
  cd: 'containedBy',
  sr: 'rangeGt',
  nxl: 'rangeGte',
  sl: 'rangeLt',
  nxr: 'rangeLte',
  adj: 'rangeAdjacent',
  ov: 'overlaps',
  fts: '',
  plfts: 'plain',
  phfts: 'phrase',
  wfts: 'websearch',
  not: 'not',
};

export const DB_OPERATIONS_TO_INSTRUMENT = ['select', 'insert', 'upsert', 'update', 'delete'];

const QUEUE_RPC_OPERATIONS = new Set(['send', 'send_batch', 'pop', 'receive', 'read']);

const INTEGRATION_NAME = 'Supabase';

type AuthOperationFn = (...args: unknown[]) => Promise<unknown>;
type AuthOperationName = (typeof AUTH_OPERATIONS_TO_INSTRUMENT)[number];
type AuthAdminOperationName = (typeof AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT)[number];
type PostgRESTQueryOperationFn = (...args: unknown[]) => PostgRESTFilterBuilder;

export interface SupabaseClientInstance {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<unknown>;
  auth: {
    admin: Record<AuthAdminOperationName, AuthOperationFn>;
  } & Record<AuthOperationName, AuthOperationFn>;
}

export interface PostgRESTQueryBuilder {
  [key: string]: PostgRESTQueryOperationFn;
}

export interface PostgRESTFilterBuilder {
  method: string;
  headers: Record<string, string>;
  url: URL;
  schema: string;
  body: unknown;
}

export interface SupabaseResponse {
  status?: number;
  data?: Array<{
    msg_id?: number;
    read_ct?: number; // PGMQ read count for retry tracking
    enqueued_at?: string;
    vt?: number; // Visibility timeout
    message?: {
      [key: string]: unknown; // Allow other message properties
      _sentry?: {
        sentry_trace?: string;
        baggage?: string;
      };
    };
  }>;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface SupabaseError extends Error {
  code?: string;
  details?: unknown;
}

export interface SupabaseBreadcrumb {
  type: string;
  category: string;
  message: string;
  data?: {
    query?: string[];
    body?: Record<string, unknown>;
  };
}

export interface PostgRESTProtoThenable {
  then: <T>(
    onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
  ) => Promise<T>;
}

type SentryInstrumented<T> = T & {
  __SENTRY_INSTRUMENTED__?: boolean;
};

function _markAsInstrumented<T>(fn: T): void {
  try {
    (fn as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__ = true;
  } catch {
    // ignore errors here
  }
}

function _isInstrumented<T>(fn: T): boolean | undefined {
  try {
    return (fn as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__;
  } catch {
    return false;
  }
}

/**
 * Extracts the database operation type from the HTTP method and headers
 * @param method - The HTTP method of the request
 * @param headers - The request headers
 * @returns The database operation type ('select', 'insert', 'upsert', 'update', or 'delete')
 */
export function extractOperation(method: string, headers: Record<string, string> = {}): string {
  switch (method) {
    case 'GET': {
      return 'select';
    }
    case 'POST': {
      if (headers['Prefer']?.includes('resolution=')) {
        return 'upsert';
      } else {
        return 'insert';
      }
    }
    case 'PATCH': {
      return 'update';
    }
    case 'DELETE': {
      return 'delete';
    }
    default: {
      return '<unknown-op>';
    }
  }
}

/**
 * Translates Supabase filter parameters into readable method names for tracing
 * @param key - The filter key from the URL search parameters
 * @param query - The filter value from the URL search parameters
 * @returns A string representation of the filter as a method call
 */
export function translateFiltersIntoMethods(key: string, query: string): string {
  if (query === '' || query === '*') {
    return 'select(*)';
  }

  if (key === 'select') {
    return `select(${query})`;
  }

  if (key === 'or' || key.endsWith('.or')) {
    return `${key}${query}`;
  }

  const [filter, ...value] = query.split('.');

  let method;
  // Handle optional `configPart` of the filter
  if (filter?.startsWith('fts')) {
    method = 'textSearch';
  } else if (filter?.startsWith('plfts')) {
    method = 'textSearch[plain]';
  } else if (filter?.startsWith('phfts')) {
    method = 'textSearch[phrase]';
  } else if (filter?.startsWith('wfts')) {
    method = 'textSearch[websearch]';
  } else {
    method = (filter && FILTER_MAPPINGS[filter as keyof typeof FILTER_MAPPINGS]) || 'filter';
  }

  return `${method}(${key}, ${value.join('.')})`;
}

/**
 * Normalizes RPC function names by stripping schema prefixes.
 * Handles schema-qualified names like 'pgmq.send' → 'send'
 *
 * @param name - The RPC function name, potentially schema-qualified
 * @returns The normalized function name without schema prefix
 */
function _normalizeRpcFunctionName(name: unknown): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Strip schema prefix: 'pgmq.send' → 'send', 'my_schema.pop' → 'pop'
  if (name.includes('.')) {
    const parts = name.split('.');
    return parts[parts.length - 1] || '';
  }

  return name;
}

/**
 * Creates a proxy handler for RPC methods to instrument queue operations.
 * This handler is shared between direct RPC calls and RPC calls via schema.
 *
 * @returns A proxy handler that routes queue operations to appropriate instrumentation
 */
function _createRpcProxyHandler(): ProxyHandler<(...args: unknown[]) => Promise<unknown>> {
  return {
    apply(
      target: (...args: unknown[]) => Promise<unknown>,
      thisArg: unknown,
      argumentsList: unknown[],
    ): Promise<unknown> {
      // Add try-catch for safety
      try {
        // Normalize RPC function name to handle schema-qualified names (e.g., 'pgmq.send' → 'send')
        const normalizedName = _normalizeRpcFunctionName(argumentsList[0]);
        const isProducerSpan = normalizedName === 'send' || normalizedName === 'send_batch';
        const isConsumerSpan = normalizedName === 'pop' || normalizedName === 'receive' || normalizedName === 'read';

        if (!isProducerSpan && !isConsumerSpan) {
          const result = Reflect.apply(target, thisArg, argumentsList);

          try {
            if (result && typeof result === 'object') {
              const builder = result as unknown as PostgRESTFilterBuilder;
              const builderConstructor = builder?.constructor;

              if (typeof builderConstructor === 'function') {
                _instrumentPostgRESTFilterBuilder(
                  builderConstructor as unknown as PostgRESTFilterBuilder['constructor'],
                );
              }

              _instrumentPostgRESTFilterBuilderInstance(builder);
            }
          } catch (error) {
            DEBUG_BUILD && debug.warn('Supabase RPC instrumentation setup failed:', error);
          }

          return result;
        }

        if (isProducerSpan) {
          return _instrumentRpcProducer(target, thisArg, argumentsList);
        } else if (isConsumerSpan) {
          return _instrumentRpcConsumer(target, thisArg, argumentsList);
        }

        return Reflect.apply(target, thisArg, argumentsList);
      } catch (error) {
        DEBUG_BUILD && debug.warn('Supabase queue instrumentation failed:', error);
        return Reflect.apply(target, thisArg, argumentsList);
      }
    },
  };
}

/**
 * Instruments RPC methods returned from `.schema()` calls.
 * This handles the pattern: `client.schema('public').rpc('function_name', params)`
 *
 * @param SupabaseClient - The Supabase client constructor to instrument
 */
function _instrumentRpcReturnedFromSchemaCall(SupabaseClient: unknown): void {
  if (_isInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.schema)) {
    return;
  }
  (SupabaseClient as SupabaseClientConstructorType).prototype.schema = new Proxy(
    (SupabaseClient as SupabaseClientConstructorType).prototype.schema,
    {
      apply(target, thisArg, argumentsList) {
        const supabaseInstance = Reflect.apply(target, thisArg, argumentsList);
        _instrumentRpcMethod(supabaseInstance as unknown as SupabaseClientConstructorType);
        return supabaseInstance;
      },
    },
  );
  _markAsInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.schema);
}

/**
 * Instruments RPC method on a Supabase instance (typically returned from `.schema()` call).
 * Uses the shared proxy handler to route queue operations.
 *
 * Note: No instrumentation guard here because each `.schema()` call returns a fresh object
 * with its own `rpc` method that needs to be instrumented.
 *
 * @param supabaseInstance - The Supabase instance to instrument
 */
function _instrumentRpcMethod(supabaseInstance: SupabaseClientConstructorType): void {
  const instance = supabaseInstance as unknown as SupabaseClientInstance;

  // Only instrument if rpc method exists
  if (!instance.rpc) {
    return;
  }

  instance.rpc = new Proxy(instance.rpc, _createRpcProxyHandler());
}

/**
 * Extracts Sentry trace context from a message's metadata.
 *
 * @param message - The message object potentially containing _sentry metadata
 * @returns Object containing sentryTrace and baggage if present
 */
function _extractTraceAndBaggageFromMessage(message: { _sentry?: { sentry_trace?: string; baggage?: string } }): {
  sentryTrace?: string;
  baggage?: string;
} {
  if (message?._sentry) {
    return {
      sentryTrace: message._sentry.sentry_trace,
      baggage: message._sentry.baggage,
    };
  }
  return {};
}

/**
 * Extracts message IDs from a Supabase queue response.
 * Handles single message IDs (numbers), arrays of message IDs, and arrays of message objects.
 *
 * @param data - The response data from a queue operation
 * @returns Comma-separated string of message IDs, or undefined if none found
 */
function _extractMessageIds(
  data?:
    | number
    | Array<
        | number
        | {
            [key: string]: unknown;
            msg_id?: number;
          }
      >,
): string | undefined {
  // Handle single message ID (e.g., from send RPC)
  if (typeof data === 'number') {
    return String(data);
  }

  if (!Array.isArray(data)) {
    return undefined;
  }

  const ids = data
    .map(item => {
      // Handle numeric message IDs in array
      if (typeof item === 'number') {
        return String(item);
      }
      // Handle message objects with msg_id field
      if (item && typeof item === 'object' && 'msg_id' in item) {
        return String(item.msg_id);
      }
      return null;
    })
    .filter(id => id !== null);

  return ids.length > 0 ? ids.join(',') : undefined;
}

/**
 * Creates a breadcrumb for a queue operation.
 *
 * @param category - The breadcrumb category (e.g., 'queue.publish', 'queue.process')
 * @param queueName - The name of the queue
 * @param data - Additional data to include in the breadcrumb
 */
function _createQueueBreadcrumb(category: string, queueName: string | undefined, data?: Record<string, unknown>): void {
  const breadcrumb: SupabaseBreadcrumb = {
    type: 'supabase',
    category,
    message: `${category}(${queueName || 'unknown'})`,
  };

  if (data && Object.keys(data).length > 0) {
    breadcrumb.data = data;
  }

  addBreadcrumb(breadcrumb);
}

/**
 * Maximum size for message body size calculation to prevent performance issues.
 * Messages larger than this will not have their size calculated.
 */
const MAX_MESSAGE_SIZE_FOR_CALCULATION = 1024 * 100; // 100KB

/**
 * Calculates the size of a message body safely with performance safeguards.
 *
 * @param message - The message to calculate size for
 * @returns The message size in bytes, or undefined if too large or calculation fails
 */
function _calculateMessageBodySize(message: unknown): number | undefined {
  if (!message) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(message);
    // Only return size if it's under the max limit to avoid performance issues
    if (serialized.length <= MAX_MESSAGE_SIZE_FOR_CALCULATION) {
      return serialized.length;
    }
    DEBUG_BUILD && debug.warn('Message body too large for size calculation:', serialized.length);
    return undefined;
  } catch {
    // Ignore JSON stringify errors
    return undefined;
  }
}

/**
 * Safely extracts a property from a queue message item.
 * Handles undefined items and non-object values.
 *
 * @param item - The queue message item
 * @param key - The property key to extract
 * @returns The property value or undefined
 */
function _getMessageProperty<T>(item: unknown, key: string): T | undefined {
  if (item && typeof item === 'object' && key in item) {
    return (item as Record<string, T>)[key];
  }
  return undefined;
}

/**
 * Captures a Supabase queue error with proper context and mechanism.
 *
 * @param error - The error from Supabase response
 * @param queueName - The name of the queue
 * @param messageId - Optional message ID for context
 */
function _captureQueueError(
  error: { message: string; code?: string; details?: unknown },
  queueName: string | undefined,
  messageId?: string,
): void {
  const err = new Error(error.message) as SupabaseError;
  if (error.code) err.code = error.code;
  if (error.details) err.details = error.details;

  captureException(err, scope => {
    scope.addEventProcessor(e => {
      addExceptionMechanism(e, {
        handled: false,
        type: 'auto.db.supabase.queue',
      });
      return e;
    });
    scope.setContext('supabase', { queueName, messageId });
    return scope;
  });
}

/**
 * Parses an enqueued_at timestamp string and returns the latency in milliseconds.
 *
 * @param enqueuedAt - The timestamp string to parse
 * @returns Latency in milliseconds, or undefined if invalid
 */
function _parseEnqueuedAtLatency(enqueuedAt: string | undefined): number | undefined {
  if (!enqueuedAt || typeof enqueuedAt !== 'string') {
    return undefined;
  }

  const timestamp = Date.parse(enqueuedAt);
  if (Number.isNaN(timestamp)) {
    DEBUG_BUILD && debug.warn('Invalid enqueued_at timestamp:', enqueuedAt);
    return undefined;
  }

  return Date.now() - timestamp;
}

/**
 * Calculates average latency for batch messages.
 *
 * @param messages - Array of messages with enqueued_at timestamps
 * @returns Average latency in milliseconds, or undefined if no valid timestamps
 */
function _calculateBatchLatency(messages: Array<{ enqueued_at?: string }>): number | undefined {
  let totalLatency = 0;
  let count = 0;

  for (const msg of messages) {
    const latency = _parseEnqueuedAtLatency(msg.enqueued_at);
    if (latency !== undefined) {
      totalLatency += latency;
      count++;
    }
  }

  return count > 0 ? totalLatency / count : undefined;
}

/**
 * Processes the consumer span by setting attributes, handling errors, and creating breadcrumbs.
 * This is extracted to simplify the instrumentRpcConsumer function.
 *
 * @param span - The span to process
 * @param res - The Supabase response
 * @param queueName - The name of the queue
 * @returns The original response
 */
function _processConsumerSpan(span: Span, res: SupabaseResponse, queueName: string | undefined): SupabaseResponse {
  // Handle edge case: no data (error case or empty response)
  const data = res.data;
  if (!data || !Array.isArray(data)) {
    // Still set required attributes for error cases
    span.setAttribute('messaging.message.retry.count', 0);
    span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

    // Create breadcrumb with queue name for error monitoring
    const breadcrumbData: Record<string, unknown> = {};
    if (queueName) {
      breadcrumbData['messaging.destination.name'] = queueName;
    }
    _createQueueBreadcrumb('queue.process', queueName, Object.keys(breadcrumbData).length ? breadcrumbData : undefined);

    // Handle errors in the response
    if (res.error) {
      _captureQueueError(res.error, queueName);
    }

    return res;
  }

  // Now TypeScript knows data is a non-empty array
  const firstItem = data.length > 0 ? data[0] : undefined;
  const isBatch = data.length > 1;

  // Calculate latency for single message or batch average
  const latency = isBatch
    ? _calculateBatchLatency(data as Array<{ enqueued_at?: string }>)
    : _parseEnqueuedAtLatency((firstItem as { enqueued_at?: string } | undefined)?.enqueued_at);

  // Extract message IDs
  const messageId = _extractMessageIds(data);

  // Set span attributes
  if (messageId) {
    span.setAttribute('messaging.message.id', messageId);
  }

  // Note: messaging.destination.name, messaging.operation.name, and messaging.operation.type
  // are already set in initial span attributes

  if (latency !== undefined) {
    span.setAttribute('messaging.message.receive.latency', latency);
  }

  // Extract retry count from PGMQ read_ct field
  const retryCount = _getMessageProperty<number>(firstItem, 'read_ct') ?? 0;
  span.setAttribute('messaging.message.retry.count', retryCount);

  // Calculate message body size with performance safeguards
  const messageBody = _getMessageProperty<unknown>(firstItem, 'message');
  const messageBodySize = _calculateMessageBodySize(messageBody);
  if (messageBodySize !== undefined) {
    span.setAttribute('messaging.message.body.size', messageBodySize);
  }

  // Add breadcrumb for monitoring
  const breadcrumbData: Record<string, unknown> = {};
  if (messageId) breadcrumbData['messaging.message.id'] = messageId;
  if (queueName) breadcrumbData['messaging.destination.name'] = queueName;
  if (messageBodySize !== undefined) breadcrumbData['messaging.message.body.size'] = messageBodySize;
  _createQueueBreadcrumb('queue.process', queueName, breadcrumbData);

  // Handle errors in the response
  if (res.error) {
    _captureQueueError(res.error, queueName, messageId);
  }

  // Set span status based on response
  span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

  return res;
}

/**
 * Instruments RPC consumer methods for queue message consumption.
 *
 * Creates queue.process spans and extracts trace context from messages
 * for distributed tracing across producer/consumer boundaries.
 */
const _instrumentRpcConsumer = (target: unknown, thisArg: unknown, argumentsList: unknown[]): Promise<unknown> => {
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  if (typeof argumentsList[0] !== 'string') {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const operationName = _normalizeRpcFunctionName(argumentsList[0]);
  const queueParams = argumentsList[1];

  if (!isPlainObject(queueParams)) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const typedParams = queueParams as { queue_name?: string; vt?: number; qty?: number };
  const queueName = typedParams.queue_name;

  if (!queueName) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  DEBUG_BUILD &&
    debug.log('Instrumenting Supabase queue consumer', {
      operation: operationName,
      queueName,
    });

  const spanName = `process ${queueName || 'unknown'}`;
  const spanAttributes = {
    [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.consumer',
    [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
    'messaging.system': 'supabase',
    'messaging.destination.name': queueName,
    'messaging.operation.name': operationName,
    'messaging.operation.type': 'process',
  } as const;
  const spanStartTime = timestampInSeconds();

  const rpcPromise = Reflect.apply(
    target as (...args: unknown[]) => Promise<unknown>,
    thisArg,
    argumentsList,
  ) as Promise<SupabaseResponse>;

  return rpcPromise
    .then(res => {
      DEBUG_BUILD && debug.log('Consumer RPC call completed', { queueName, hasData: !!res.data });

      // Skip span creation for empty/null responses when there's no error - no messages to process
      // Still create span if there's an error to capture the failure
      if ((!res.data || (Array.isArray(res.data) && res.data.length === 0)) && !res.error) {
        DEBUG_BUILD && debug.log('Skipping consumer span for empty response', { queueName });
        return res;
      }

      // Extract trace context from message for distributed tracing
      const { sentryTrace } = _extractTraceAndBaggageFromMessage(res.data?.[0]?.message || {});

      // Clean up _sentry metadata from messages before returning to user
      // Use immutable updates to avoid mutating the original response data
      if (Array.isArray(res.data)) {
        const hasMetadata = res.data.some(
          item =>
            item &&
            typeof item === 'object' &&
            item.message &&
            typeof item.message === 'object' &&
            '_sentry' in item.message,
        );

        if (hasMetadata) {
          res.data = res.data.map(item => {
            if (item && typeof item === 'object' && item.message && typeof item.message === 'object') {
              const messageCopy = { ...(item.message as Record<string, unknown>) };
              delete messageCopy._sentry;
              return { ...item, message: messageCopy };
            }
            return item;
          });
        }
      }

      // Extract producer trace context for span link
      let producerSpanContext: { traceId: string; spanId: string; traceFlags: number } | undefined;

      if (sentryTrace) {
        const traceparentData = extractTraceparentData(sentryTrace);
        if (traceparentData?.traceId && traceparentData?.parentSpanId) {
          // Convert parentSampled boolean to traceFlags (W3C trace context spec)
          // traceFlags bit 0 (LSB) = sampled flag: 1 if sampled, 0 if not sampled
          const traceFlags = traceparentData.parentSampled ? 1 : 0;

          producerSpanContext = {
            traceId: traceparentData.traceId,
            spanId: traceparentData.parentSpanId,
            traceFlags,
          };
        }
      }

      const runWithSpan = (): SupabaseResponse => {
        // Create consumer span as child of current transaction (e.g., HTTP request)
        // Add span link to producer span for distributed tracing across async queue boundary
        return startSpan(
          {
            name: spanName,
            op: 'queue.process',
            startTime: spanStartTime,
            attributes: spanAttributes,
            // Add span link to producer span for distributed tracing across async queue boundary
            links: producerSpanContext
              ? [
                  {
                    context: producerSpanContext,
                    attributes: { 'sentry.link.type': 'queue.producer' },
                  },
                ]
              : undefined,
          },
          span => {
            try {
              const processedResponse = _processConsumerSpan(span, res, queueName);

              DEBUG_BUILD && debug.log('Consumer span processed successfully', { queueName });

              return processedResponse;
            } catch (err: unknown) {
              DEBUG_BUILD && debug.log('Consumer span processing failed', { queueName, error: err });

              captureException(err, scope => {
                scope.addEventProcessor(e => {
                  addExceptionMechanism(e, {
                    handled: false,
                    type: 'auto.db.supabase.queue',
                  });
                  return e;
                });
                scope.setContext('supabase', { queueName });
                return scope;
              });

              span.setStatus({ code: SPAN_STATUS_ERROR });
              throw err;
            }
          },
        );
      };

      // Create consumer span as child of current transaction with span links for distributed tracing
      return runWithSpan();
    })
    .catch((err: unknown) => {
      DEBUG_BUILD && debug.log('Consumer RPC call failed', { queueName, error: err });

      return startSpan(
        {
          name: spanName,
          op: 'queue.process',
          startTime: spanStartTime,
          attributes: spanAttributes,
        },
        span => {
          if (queueName) {
            span.setAttribute('messaging.destination.name', queueName);
          }

          const breadcrumbData: Record<string, unknown> = {};
          if (queueName) {
            breadcrumbData['messaging.destination.name'] = queueName;
          }
          _createQueueBreadcrumb(
            'queue.process',
            queueName,
            Object.keys(breadcrumbData).length ? breadcrumbData : undefined,
          );

          captureException(err, scope => {
            scope.addEventProcessor(e => {
              addExceptionMechanism(e, {
                handled: false,
                type: 'auto.db.supabase.queue',
              });
              return e;
            });
            scope.setContext('supabase', { queueName });
            return scope;
          });

          span.setStatus({ code: SPAN_STATUS_ERROR });
          throw err;
        },
      );
    });
};

/**
 * Instruments RPC producer methods for queue message production.
 *
 * Creates queue.publish spans and injects trace context into messages
 * for distributed tracing across producer/consumer boundaries.
 */
function _instrumentRpcProducer(target: unknown, thisArg: unknown, argumentsList: unknown[]): Promise<unknown> {
  // Runtime validation
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const maybeQueueParams = argumentsList[1];

  // If the second argument is not an object, it's not a queue operation
  if (!isPlainObject(maybeQueueParams)) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  // Now safe to type assert
  const queueParams = maybeQueueParams as { queue_name?: string; message?: unknown; messages?: unknown[] };
  const queueName = queueParams?.queue_name;

  if (!queueName) {
    return Reflect.apply(target as (...args: unknown[]) => Promise<unknown>, thisArg, argumentsList);
  }

  const operationName = _normalizeRpcFunctionName(argumentsList[0]) as 'send' | 'send_batch';
  const isBatch = operationName === 'send_batch';

  DEBUG_BUILD &&
    debug.log('Instrumenting Supabase queue producer', {
      operation: operationName,
      queueName,
      isBatch,
    });

  // Calculate message body size upfront for initial span attributes
  const messageBodySize = _calculateMessageBodySize(queueParams?.message || queueParams?.messages);

  return startSpan(
    {
      name: `publish ${queueName || 'unknown'}`,
      op: 'queue.publish',
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
        'messaging.system': 'supabase',
        'messaging.destination.name': queueName,
        'messaging.operation.name': operationName,
        'messaging.operation.type': 'publish',
        ...(messageBodySize !== undefined && { 'messaging.message.body.size': messageBodySize }),
      },
    },
    span => {
      const sentryTrace = spanToTraceHeader(span);
      const scope = getCurrentScope();
      const client = getClient();
      const { dsc } = scope.getPropagationContext();
      const traceContext = spanToTraceContext(span);
      const sentryBaggage = dynamicSamplingContextToSentryBaggageHeader(
        dsc ||
          (client ? getDynamicSamplingContextFromClient(traceContext.trace_id, client) : undefined) ||
          getDynamicSamplingContextFromSpan(span),
      );

      const originalParams = argumentsList[1] as {
        queue_name: string;
        messages?: Array<{ _sentry?: { sentry_trace?: string; baggage?: string } }>;
        message?: { _sentry?: { sentry_trace?: string; baggage?: string } };
      };

      // Create a deep copy of the params to avoid mutating the original
      // This ensures the caller's original params remain unchanged
      const paramsWithTrace: typeof originalParams = {
        ...originalParams,
      };

      // Inject trace context into messages (avoid mutation of original params)
      // Only inject into plain objects to prevent payload corruption (primitives, arrays)
      if (originalParams?.message) {
        if (isPlainObject(originalParams.message)) {
          paramsWithTrace.message = {
            ...originalParams.message,
            _sentry: {
              sentry_trace: sentryTrace,
              baggage: sentryBaggage,
            },
          };
        } else {
          DEBUG_BUILD &&
            debug.warn(
              'Skipping trace propagation for non-object message payload. PGMQ supports primitives and arrays, but trace context can only be injected into plain objects.',
            );
        }
      } else if (originalParams?.messages) {
        paramsWithTrace.messages = originalParams.messages.map(message => {
          if (isPlainObject(message)) {
            return {
              ...message,
              _sentry: {
                sentry_trace: sentryTrace,
                baggage: sentryBaggage,
              },
            };
          } else {
            DEBUG_BUILD &&
              debug.warn(
                'Skipping trace propagation for non-object message in batch. PGMQ supports primitives and arrays, but trace context can only be injected into plain objects.',
              );
            return message;
          }
        });
      }

      // Create new arguments list with the modified params (don't mutate original argumentsList)
      const modifiedArgumentsList = [argumentsList[0], paramsWithTrace];

      const promise = Reflect.apply(
        target as (...args: unknown[]) => Promise<unknown>,
        thisArg,
        modifiedArgumentsList,
      ) as Promise<SupabaseResponse>;
      return promise
        .then((res: SupabaseResponse) => {
          const messageId = _extractMessageIds(res.data);

          // messaging.message.id is set after response since PGMQ generates it
          if (messageId) {
            span.setAttribute('messaging.message.id', messageId);
          }

          // messaging.batch.message_count is set for batch operations
          if (isBatch && Array.isArray(res?.data)) {
            span.setAttribute('messaging.batch.message_count', res.data.length);
          }

          const breadcrumbData: Record<string, unknown> = {
            'messaging.destination.name': queueName,
          };
          if (messageId) {
            breadcrumbData['messaging.message.id'] = messageId;
          }
          if (messageBodySize !== undefined) {
            breadcrumbData['messaging.message.body.size'] = messageBodySize;
          }
          if (isBatch && Array.isArray(res?.data)) {
            breadcrumbData['messaging.batch.message_count'] = res.data.length;
          }
          _createQueueBreadcrumb('queue.publish', queueName, breadcrumbData);

          if (res.error) {
            const err = new Error(res.error.message) as SupabaseError;
            if (res.error.code) err.code = res.error.code;
            if (res.error.details) err.details = res.error.details;

            captureException(err, scope => {
              scope.addEventProcessor(e => {
                addExceptionMechanism(e, {
                  handled: false,
                  type: 'auto.db.supabase.queue',
                });
                return e;
              });
              scope.setContext('supabase', { queueName, messageId, operation: operationName });
              return scope;
            });
          }

          span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });
          span.end();

          return res;
        })
        .catch((err: unknown) => {
          span.setStatus({ code: SPAN_STATUS_ERROR });
          span.end();

          captureException(err, scope => {
            scope.addEventProcessor(e => {
              addExceptionMechanism(e, {
                handled: false,
                type: 'auto.db.supabase.queue',
              });
              return e;
            });
            scope.setContext('supabase', { queueName, operation: operationName });
            return scope;
          });

          throw err;
        });
    },
  );
}

/**
 * Instruments direct RPC calls on a Supabase client's constructor prototype.
 * This handles the pattern: `client.rpc('function_name', params)`
 * Uses the shared proxy handler to route queue operations.
 *
 * We instrument the prototype rather than individual instances to ensure consistent
 * behavior across all clients sharing the same constructor and to avoid issues with
 * Proxy property forwarding affecting the instrumentation marker on the original function.
 *
 * @param SupabaseClientConstructor - The Supabase client constructor to instrument
 */
function _instrumentRpc(SupabaseClientConstructor: unknown): void {
  const prototype = (SupabaseClientConstructor as SupabaseClientConstructorType).prototype;

  if (!prototype?.rpc) {
    return;
  }

  // Prevent double-wrapping if instrumentSupabaseClient is called multiple times
  if (_isInstrumented(prototype.rpc)) {
    return;
  }

  const wrappedRpc = new Proxy(prototype.rpc, _createRpcProxyHandler());
  prototype.rpc = wrappedRpc;

  _markAsInstrumented(prototype.rpc);
}

/**
 * Instruments Supabase auth operations.
 *
 * Creates auto.db.supabase spans for auth operations (signIn, signUp, etc.)
 * to track authentication performance and errors.
 */
function _instrumentAuthOperation(operation: AuthOperationFn, isAdmin = false): AuthOperationFn {
  return new Proxy(operation, {
    apply(target, thisArg, argumentsList) {
      return startSpan(
        {
          name: `auth ${isAdmin ? '(admin) ' : ''}${operation.name}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
            'db.system': 'postgresql',
            'db.operation': `auth.${isAdmin ? 'admin.' : ''}${operation.name}`,
          },
        },
        span => {
          return Reflect.apply(target, thisArg, argumentsList)
            .then((res: unknown) => {
              if (res && typeof res === 'object' && 'error' in res && res.error) {
                span.setStatus({ code: SPAN_STATUS_ERROR });

                captureException(res.error, {
                  mechanism: {
                    handled: false,
                    type: 'auto.db.supabase.auth',
                  },
                });
              } else {
                span.setStatus({ code: SPAN_STATUS_OK });
              }

              span.end();
              return res;
            })
            .catch((err: unknown) => {
              span.setStatus({ code: SPAN_STATUS_ERROR });
              span.end();

              captureException(err, {
                mechanism: {
                  handled: false,
                  type: 'auto.db.supabase.auth',
                },
              });

              throw err;
            });
        },
      );
    },
  });
}

/**
 * Instruments all auth operations on a Supabase client instance.
 *
 * Iterates through AUTH_OPERATIONS_TO_INSTRUMENT and AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT,
 * wrapping each operation with Sentry instrumentation. Handles both regular auth operations
 * (signIn, signUp, etc.) and admin operations (createUser, deleteUser, etc.).
 *
 * @param supabaseClientInstance - The Supabase client instance to instrument
 */
function _instrumentSupabaseAuthClient(supabaseClientInstance: SupabaseClientInstance): void {
  const auth = supabaseClientInstance.auth;

  if (!auth || _isInstrumented(supabaseClientInstance.auth)) {
    return;
  }

  for (const operation of AUTH_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth[operation] === 'function') {
      supabaseClientInstance.auth[operation] = _instrumentAuthOperation(authOperation);
    }
  }

  for (const operation of AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth.admin[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth.admin[operation] === 'function') {
      supabaseClientInstance.auth.admin[operation] = _instrumentAuthOperation(authOperation, true);
    }
  }

  _markAsInstrumented(supabaseClientInstance.auth);
}

function _instrumentSupabaseClientConstructor(SupabaseClient: unknown): void {
  if (_isInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.from)) {
    return;
  }

  (SupabaseClient as SupabaseClientConstructorType).prototype.from = new Proxy(
    (SupabaseClient as SupabaseClientConstructorType).prototype.from,
    {
      apply(target, thisArg, argumentsList) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTQueryBuilder = (rv as PostgRESTQueryBuilder).constructor;

        _instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder as unknown as new () => PostgRESTQueryBuilder);

        return rv;
      },
    },
  );

  _markAsInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.from);
}

/**
 * Instruments PostgREST filter builder to trace database operations.
 *
 * This function intercepts the `.then()` method on PostgRESTFilterBuilder to wrap
 * database operations with Sentry tracing. It extracts operation details (table name,
 * query parameters, body) and creates spans with appropriate semantic attributes.
 *
 * The instrumentation pattern:
 * 1. Intercepts user's `.then(callback)` call
 * 2. Calls original `.then()` with no arguments to get the raw promise
 * 3. Adds instrumentation callbacks to create spans and capture errors
 * 4. Forwards user's callbacks to receive the instrumented result
 *
 * This ensures the user's callbacks receive the result AFTER instrumentation completes.
 *
 * @param PostgRESTFilterBuilder - The PostgREST filter builder constructor to instrument
 */
function _createInstrumentedPostgRESTThen(
  originalThen: PostgRESTProtoThenable['then'],
): PostgRESTProtoThenable['then'] {
  return new Proxy(originalThen, {
    apply(target, thisArg, argumentsList) {
      const operations = DB_OPERATIONS_TO_INSTRUMENT;
      const typedThis = thisArg as PostgRESTFilterBuilder;
      const operation = extractOperation(typedThis.method, typedThis.headers);

      if (!operations.includes(operation)) {
        return Reflect.apply(target, thisArg, argumentsList);
      }

      if (!typedThis?.url?.pathname || typeof typedThis.url.pathname !== 'string') {
        return Reflect.apply(target, thisArg, argumentsList);
      }

      const pathParts = typedThis.url.pathname.split('/');
      const rpcIndex = pathParts.indexOf('rpc');
      const rpcFunctionName = rpcIndex !== -1 && pathParts.length > rpcIndex + 1 ? pathParts[rpcIndex + 1] : undefined;

      // Normalize RPC function name to handle schema-qualified names (e.g., 'pgmq.send' → 'send')
      if (rpcFunctionName && QUEUE_RPC_OPERATIONS.has(_normalizeRpcFunctionName(rpcFunctionName))) {
        // Queue RPC calls are instrumented in the dedicated queue instrumentation.
        return Reflect.apply(target, thisArg, argumentsList);
      }

      const table = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';

      const queryItems: string[] = [];
      for (const [key, value] of typedThis.url.searchParams.entries()) {
        // It's possible to have multiple entries for the same key, eg. `id=eq.7&id=eq.3`,
        // so we need to use array instead of object to collect them.
        queryItems.push(translateFiltersIntoMethods(key, value));
      }
      const body: Record<string, unknown> = Object.create(null);
      if (isPlainObject(typedThis.body)) {
        for (const [key, value] of Object.entries(typedThis.body)) {
          body[key] = value;
        }
      }

      // Adding operation to the beginning of the description if it's not a `select` operation
      // For example, it can be an `insert` or `update` operation but the query can be `select(...)`
      // For `select` operations, we don't need repeat it in the description
      const description = `${operation === 'select' ? '' : `${operation}${body ? '(...) ' : ''}`}${queryItems.join(
        ' ',
      )} from(${table})`;

      const attributes: Record<string, unknown> = {
        'db.table': table,
        'db.schema': typedThis.schema,
        'db.url': typedThis.url.origin,
        'db.sdk': typedThis.headers['X-Client-Info'],
        'db.system': 'postgresql',
        'db.operation': operation,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
      };

      if (queryItems.length) {
        attributes['db.query'] = queryItems;
      }

      if (Object.keys(body).length) {
        attributes['db.body'] = body;
      }

      return startSpan(
        {
          name: description,
          attributes: attributes as SpanAttributes,
        },
        span => {
          return (Reflect.apply(target, thisArg, []) as Promise<SupabaseResponse>)
            .then(
              (res: SupabaseResponse) => {
                if (span) {
                  if (res && typeof res === 'object' && 'status' in res) {
                    setHttpStatus(span, res.status || 500);
                  }
                  span.end();
                }

                const breadcrumb: SupabaseBreadcrumb = {
                  type: 'supabase',
                  category: `db.${operation}`,
                  message: description,
                };

                const data: Record<string, unknown> = {};

                if (queryItems.length) {
                  data.query = queryItems;
                }

                if (Object.keys(body).length) {
                  data.body = body;
                }

                if (Object.keys(data).length) {
                  breadcrumb.data = data;
                }

                addBreadcrumb(breadcrumb);

                if (res.error) {
                  const err = new Error(res.error.message) as SupabaseError;
                  if (res.error.code) err.code = res.error.code;
                  if (res.error.details) err.details = res.error.details;

                  const supabaseContext: Record<string, unknown> = {};
                  if (queryItems.length) {
                    supabaseContext.query = queryItems;
                  }
                  if (Object.keys(body).length) {
                    supabaseContext.body = body;
                  }

                  captureException(err, scope => {
                    scope.addEventProcessor(e => {
                      addExceptionMechanism(e, {
                        handled: false,
                        type: 'auto.db.supabase.postgres',
                      });

                      return e;
                    });

                    scope.setContext('supabase', supabaseContext);

                    return scope;
                  });
                }

                return res;
              },
              (err: Error) => {
                // Capture exception for database operation errors (network failures, etc.)
                captureException(err, scope => {
                  scope.addEventProcessor(e => {
                    addExceptionMechanism(e, {
                      handled: false,
                      type: 'auto.db.supabase.postgres',
                    });
                    return e;
                  });
                  scope.setContext('supabase', {
                    operation: operation,
                    table: table,
                  });
                  return scope;
                });

                if (span) {
                  setHttpStatus(span, 500);
                  span.end();
                }
                throw err;
              },
            )
            .then(...argumentsList);
        },
      );
    },
  });
}

function _instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder: PostgRESTFilterBuilder['constructor']): void {
  const prototype = PostgRESTFilterBuilder?.prototype as unknown as PostgRESTProtoThenable | undefined;

  if (!prototype) {
    return;
  }

  const originalThen = prototype.then;

  if (typeof originalThen !== 'function') {
    return;
  }

  if (_isInstrumented(originalThen)) {
    return;
  }

  prototype.then = _createInstrumentedPostgRESTThen(originalThen);

  _markAsInstrumented(prototype.then);
}

function _instrumentPostgRESTFilterBuilderInstance(builder: PostgRESTFilterBuilder): void {
  if (!builder || typeof builder !== 'object') {
    return;
  }

  const thenable = builder as unknown as PostgRESTProtoThenable;
  const originalThen = thenable?.then;

  if (typeof originalThen !== 'function') {
    return;
  }

  if (_isInstrumented(originalThen)) {
    return;
  }

  thenable.then = _createInstrumentedPostgRESTThen(originalThen);

  _markAsInstrumented(thenable.then);
}

/**
 * Instruments PostgREST query builder operations (select, insert, update, delete, upsert).
 *
 * This function wraps each database operation method on PostgRESTQueryBuilder. When an operation
 * is called, it returns a PostgRESTFilterBuilder, which is then instrumented to trace the actual
 * database call.
 *
 * We instrument all operations (despite them sharing the same PostgRESTFilterBuilder constructor)
 * because we don't know which operation will be called first, and we want to ensure no calls
 * are missed.
 *
 * @param PostgRESTQueryBuilder - The PostgREST query builder constructor to instrument
 */
function _instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder: new () => PostgRESTQueryBuilder): void {
  // We need to wrap _all_ operations despite them sharing the same `PostgRESTFilterBuilder`
  // constructor, as we don't know which method will be called first, and we don't want to miss any calls.
  for (const operation of DB_OPERATIONS_TO_INSTRUMENT) {
    type PostgRESTOperation = keyof Pick<PostgRESTQueryBuilder, 'select' | 'insert' | 'upsert' | 'update' | 'delete'>;
    const prototypeWithOps = PostgRESTQueryBuilder.prototype as Partial<
      Record<PostgRESTOperation, PostgRESTQueryBuilder[PostgRESTOperation]>
    >;

    const originalOperation = prototypeWithOps[operation as PostgRESTOperation];

    if (_isInstrumented(originalOperation)) {
      continue;
    }

    if (!originalOperation) {
      continue;
    }

    const wrappedOperation = new Proxy(originalOperation, {
      apply(target: PostgRESTQueryOperationFn, thisArg: unknown, argumentsList: Parameters<PostgRESTQueryOperationFn>) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTFilterBuilder = rv.constructor;

        DEBUG_BUILD && debug.log(`Instrumenting ${operation} operation's PostgRESTFilterBuilder`);

        _instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder);
        _instrumentPostgRESTFilterBuilderInstance(rv);

        return rv;
      },
    });

    prototypeWithOps[operation as PostgRESTOperation] = wrappedOperation;

    _markAsInstrumented(wrappedOperation);
  }
}

export const instrumentSupabaseClient = (supabaseClient: unknown): void => {
  if (!supabaseClient) {
    DEBUG_BUILD && debug.warn('Supabase integration was not installed because no Supabase client was provided.');
    return;
  }
  const SupabaseClientConstructor =
    supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor;

  _instrumentSupabaseClientConstructor(SupabaseClientConstructor);
  _instrumentRpcReturnedFromSchemaCall(SupabaseClientConstructor);
  _instrumentRpc(SupabaseClientConstructor);
  _instrumentSupabaseAuthClient(supabaseClient as SupabaseClientInstance);
};

const _supabaseIntegration = ((options: { supabaseClient: unknown }) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentSupabaseClient(options.supabaseClient);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [Supabase](https://supabase.com/) library.
 *
 * Instruments Supabase client operations including database queries, auth operations, and queue operations (via PGMQ).
 * Creates spans and breadcrumbs for all operations, with support for distributed tracing across queue producers and consumers.
 *
 * For more information, see the [`supabaseIntegration` documentation](https://docs.sentry.io/platforms/javascript/configuration/integrations/supabase/).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/core');
 * const { createClient } = require('@supabase/supabase-js');
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
 *
 * Sentry.init({
 *   integrations: [Sentry.supabaseIntegration({ supabaseClient: supabase })],
 * });
 * ```
 */
export const supabaseIntegration = defineIntegration(_supabaseIntegration);
