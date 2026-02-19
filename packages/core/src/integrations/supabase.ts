// Based on Kamil Ogórek's work on:
// https://github.com/supabase-community/sentry-integration-js

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines */
import { addBreadcrumb } from '../breadcrumbs';
import { getClient, getCurrentScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import { captureException } from '../exports';
import { defineIntegration } from '../integration';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE,
} from '../semanticAttributes';
import { setHttpStatus, SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../tracing';
import {
  getDynamicSamplingContextFromClient,
  getDynamicSamplingContextFromSpan,
} from '../tracing/dynamicSamplingContext';
import type { IntegrationFn } from '../types-hoist/integration';
import type { SpanAttributes, SpanAttributeValue } from '../types-hoist/span';
import { dynamicSamplingContextToSentryBaggageHeader } from '../utils/baggage';
import { debug } from '../utils/debug-logger';
import { isPlainObject } from '../utils/is';
import { addExceptionMechanism } from '../utils/misc';
import { safeDateNow } from '../utils/randomSafeContext';
import { spanToTraceContext, spanToTraceHeader } from '../utils/spanUtils';
import { extractTraceparentData } from '../utils/tracing';

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

type AuthOperationFn = (...args: unknown[]) => Promise<unknown>;
type AuthOperationName = (typeof AUTH_OPERATIONS_TO_INSTRUMENT)[number];
type AuthAdminOperationName = (typeof AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT)[number];
type PostgRESTQueryOperationFn = (...args: unknown[]) => PostgRESTFilterBuilder;

export interface SupabaseClientInstance {
  rpc: (fn: string, params: Record<string, unknown>) => unknown;
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
  body: any;
}

export interface SupabaseResponse {
  status?: number;
  data?: unknown;
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

export interface SupabaseClientConstructor {
  prototype: {
    from: (table: string) => PostgRESTQueryBuilder;
    schema: (schema: string) => { rpc: (...args: unknown[]) => unknown };
    rpc: (...args: unknown[]) => unknown;
  };
}

interface SupabaseQueueMessage {
  msg_id?: number;
  read_ct?: number;
  enqueued_at?: string;
  vt?: number;
  message?: {
    [key: string]: unknown;
    _sentry?: {
      sentry_trace?: string;
      baggage?: string;
    };
  };
}

export interface PostgRESTProtoThenable {
  then: <T>(
    onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
    onrejected?: ((reason: any) => T | PromiseLike<T>) | null,
  ) => Promise<T>;
}

type SentryInstrumented<T> = T & {
  __SENTRY_INSTRUMENTED__?: boolean;
};

function markAsInstrumented<T>(fn: T): void {
  try {
    (fn as SentryInstrumented<T>).__SENTRY_INSTRUMENTED__ = true;
  } catch {
    // ignore errors here
  }
}

function isInstrumented<T>(fn: T): boolean | undefined {
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

function instrumentAuthOperation(operation: AuthOperationFn, isAdmin = false): AuthOperationFn {
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
            })
            .then(...argumentsList);
        },
      );
    },
  });
}

function instrumentSupabaseAuthClient(supabaseClientInstance: SupabaseClientInstance): void {
  const auth = supabaseClientInstance.auth;

  if (!auth || isInstrumented(supabaseClientInstance.auth)) {
    return;
  }

  for (const operation of AUTH_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth[operation] === 'function') {
      supabaseClientInstance.auth[operation] = instrumentAuthOperation(authOperation);
    }
  }

  for (const operation of AUTH_ADMIN_OPERATIONS_TO_INSTRUMENT) {
    const authOperation = auth.admin[operation];

    if (!authOperation) {
      continue;
    }

    if (typeof supabaseClientInstance.auth.admin[operation] === 'function') {
      supabaseClientInstance.auth.admin[operation] = instrumentAuthOperation(authOperation, true);
    }
  }

  markAsInstrumented(supabaseClientInstance.auth);
}

function instrumentSupabaseClientConstructor(SupabaseClient: unknown): void {
  if (isInstrumented((SupabaseClient as SupabaseClientConstructor).prototype.from)) {
    return;
  }

  (SupabaseClient as SupabaseClientConstructor).prototype.from = new Proxy(
    (SupabaseClient as SupabaseClientConstructor).prototype.from,
    {
      apply(target, thisArg, argumentsList) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTQueryBuilder = (rv as PostgRESTQueryBuilder).constructor;

        instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder as unknown as new () => PostgRESTQueryBuilder);

        return rv;
      },
    },
  );

  markAsInstrumented((SupabaseClient as SupabaseClientConstructor).prototype.from);
}

function instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder: PostgRESTFilterBuilder['constructor']): void {
  if (isInstrumented((PostgRESTFilterBuilder.prototype as unknown as PostgRESTProtoThenable).then)) {
    return;
  }

  (PostgRESTFilterBuilder.prototype as unknown as PostgRESTProtoThenable).then = new Proxy(
    (PostgRESTFilterBuilder.prototype as unknown as PostgRESTProtoThenable).then,
    {
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
        // Skip all RPC calls - they are instrumented via createRpcProxyHandler
        if (rpcIndex !== -1) {
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

        const attributes: Record<string, any> = {
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
            attributes,
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

                  if (res.error) {
                    const err = new Error(res.error.message) as SupabaseError;
                    if (res.error.code) {
                      err.code = res.error.code;
                    }
                    if (res.error.details) {
                      err.details = res.error.details;
                    }

                    const supabaseContext: Record<string, any> = {};
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

                  return res;
                },
                (err: Error) => {
                  // TODO: shouldn't we capture this error?
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
    },
  );

  markAsInstrumented((PostgRESTFilterBuilder.prototype as unknown as PostgRESTProtoThenable).then);
}

function instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder: new () => PostgRESTQueryBuilder): void {
  // We need to wrap _all_ operations despite them sharing the same `PostgRESTFilterBuilder`
  // constructor, as we don't know which method will be called first, and we don't want to miss any calls.
  for (const operation of DB_OPERATIONS_TO_INSTRUMENT) {
    if (isInstrumented((PostgRESTQueryBuilder.prototype as Record<string, any>)[operation])) {
      continue;
    }

    type PostgRESTOperation = keyof Pick<PostgRESTQueryBuilder, 'select' | 'insert' | 'upsert' | 'update' | 'delete'>;
    (PostgRESTQueryBuilder.prototype as Record<string, any>)[operation as PostgRESTOperation] = new Proxy(
      (PostgRESTQueryBuilder.prototype as Record<string, any>)[operation as PostgRESTOperation],
      {
        apply(target, thisArg, argumentsList) {
          const rv = Reflect.apply(target, thisArg, argumentsList);
          const PostgRESTFilterBuilder = (rv as PostgRESTFilterBuilder).constructor;

          DEBUG_BUILD && debug.log(`Instrumenting ${operation} operation's PostgRESTFilterBuilder`);

          instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder);

          return rv;
        },
      },
    );

    markAsInstrumented((PostgRESTQueryBuilder.prototype as Record<string, any>)[operation]);
  }
}

function normalizeRpcFunctionName(name: unknown): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  if (name.includes('.')) {
    const parts = name.split('.');
    return parts[parts.length - 1] || '';
  }

  return name;
}

function captureSupabaseError(error: unknown, mechanismType: string, context?: Record<string, unknown>): void {
  captureException(error, scope => {
    scope.addEventProcessor(e => {
      addExceptionMechanism(e, {
        handled: false,
        type: mechanismType,
      });
      return e;
    });
    if (context) {
      scope.setContext('supabase', context);
    }
    return scope;
  });
}

function extractMessageIds(data: unknown): string | undefined {
  if (typeof data === 'number') {
    return String(data);
  }

  if (!Array.isArray(data)) {
    return undefined;
  }

  const ids: string[] = [];
  for (const item of data) {
    if (typeof item === 'number') {
      ids.push(String(item));
    } else if (item && typeof item === 'object' && 'msg_id' in item && (item as { msg_id?: number }).msg_id != null) {
      ids.push(String((item as { msg_id?: number }).msg_id));
    }
  }

  return ids.length > 0 ? ids.join(',') : undefined;
}

function calculateMessageBodySize(message: unknown): number | undefined {
  if (!message) {
    return undefined;
  }

  try {
    return JSON.stringify(message).length;
  } catch {
    return undefined;
  }
}

function captureQueueError(
  error: { message: string; code?: string; details?: unknown },
  queueName: string | undefined,
  mechanismType: string,
  messageId?: string,
  extraContext?: Record<string, unknown>,
): void {
  const err = new Error(error.message) as SupabaseError;
  if (error.code) err.code = error.code;
  if (error.details) err.details = error.details;

  captureSupabaseError(err, mechanismType, { queueName, messageId, ...extraContext });
}

/** Returns latency from an enqueued_at timestamp in milliseconds. */
function parseEnqueuedAtLatency(enqueuedAt: string | undefined): number | undefined {
  if (!enqueuedAt) {
    return undefined;
  }

  const timestamp = Date.parse(enqueuedAt);
  if (Number.isNaN(timestamp)) {
    DEBUG_BUILD && debug.warn('Invalid enqueued_at timestamp:', enqueuedAt);
    return undefined;
  }

  return safeDateNow() - timestamp;
}

/** Instruments RPC producer calls with queue.publish spans and trace context injection. */
function instrumentRpcProducer(
  target: (...args: unknown[]) => unknown,
  thisArg: unknown,
  argumentsList: unknown[],
): unknown {
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  const maybeQueueParams = argumentsList[1];

  if (!isPlainObject(maybeQueueParams)) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  const queueParams = maybeQueueParams as { queue_name?: string; message?: unknown; messages?: unknown[] };
  const queueName = queueParams?.queue_name;

  if (!queueName) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  const operationName = normalizeRpcFunctionName(argumentsList[0]) as 'send' | 'send_batch';
  const isBatch = operationName === 'send_batch';

  const messageBodySize = calculateMessageBodySize(queueParams?.message || queueParams?.messages);

  return startSpan(
    {
      name: `publish ${queueName}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.producer',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.publish',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
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

      const paramsWithTrace: typeof originalParams = {
        ...originalParams,
      };

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
          DEBUG_BUILD && debug.warn('Non-object message payload, skipping trace injection');
        }
      } else if (Array.isArray(originalParams?.messages)) {
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
            DEBUG_BUILD && debug.warn('Non-object message in batch, skipping trace injection');
            return message;
          }
        });
      }

      const modifiedArgumentsList = [argumentsList[0], paramsWithTrace, ...argumentsList.slice(2)];

      const promise = Reflect.apply(target, thisArg, modifiedArgumentsList) as Promise<SupabaseResponse>;
      return promise.then(
        (res: SupabaseResponse) => {
          const messageId = extractMessageIds(res.data);

          if (messageId) {
            span.setAttribute('messaging.message.id', messageId);
          }

          if (isBatch && Array.isArray(res.data)) {
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
          if (isBatch && Array.isArray(res.data)) {
            breadcrumbData['messaging.batch.message_count'] = res.data.length;
          }
          addBreadcrumb({
            type: 'supabase',
            category: 'queue.publish',
            message: `queue.publish(${queueName || 'unknown'})`,
            data: breadcrumbData,
          });

          if (res.error) {
            captureQueueError(res.error, queueName, 'auto.db.supabase.queue.producer', messageId, {
              operation: operationName,
            });
          }

          span.setStatus({ code: res.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

          return res;
        },
        (err: unknown) => {
          span.setStatus({ code: SPAN_STATUS_ERROR });

          captureSupabaseError(err, 'auto.db.supabase.queue.producer', { queueName, operation: operationName });

          throw err;
        },
      );
    },
  );
}

function processConsumerSpanData(
  span: { setAttribute: (key: string, value: SpanAttributeValue | undefined) => void },
  queueName: string | undefined,
  cleanedData: SupabaseQueueMessage[],
): string | undefined {
  const firstItem = cleanedData.length > 0 ? cleanedData[0] : undefined;
  const isBatch = cleanedData.length > 1;

  let latency: number | undefined;
  if (isBatch) {
    let totalLatency = 0;
    let latencyCount = 0;
    for (const msg of cleanedData) {
      const msgLatency = parseEnqueuedAtLatency(msg.enqueued_at);
      if (msgLatency !== undefined) {
        totalLatency += msgLatency;
        latencyCount++;
      }
    }
    latency = latencyCount > 0 ? totalLatency / latencyCount : undefined;
  } else {
    latency = parseEnqueuedAtLatency(firstItem?.enqueued_at);
  }

  const messageId = extractMessageIds(cleanedData);

  if (isBatch) {
    span.setAttribute('messaging.batch.message_count', cleanedData.length);
  }

  if (messageId) {
    span.setAttribute('messaging.message.id', messageId);
  }

  if (latency !== undefined) {
    span.setAttribute('messaging.message.receive.latency', latency);
  }

  const readCount = firstItem?.read_ct ?? 0;
  const retryCount = Math.max(0, readCount - 1);
  span.setAttribute('messaging.message.retry.count', retryCount);

  const messageBodySize = calculateMessageBodySize(firstItem?.message);
  if (messageBodySize !== undefined) {
    span.setAttribute('messaging.message.body.size', messageBodySize);
  }

  const breadcrumbData: Record<string, unknown> = {};
  if (messageId) {
    breadcrumbData['messaging.message.id'] = messageId;
  }
  breadcrumbData['messaging.destination.name'] = queueName;
  if (messageBodySize !== undefined) {
    breadcrumbData['messaging.message.body.size'] = messageBodySize;
  }
  addBreadcrumb({
    type: 'supabase',
    category: 'queue.process',
    message: `queue.process(${queueName || 'unknown'})`,
    ...(Object.keys(breadcrumbData).length > 0 && { data: breadcrumbData }),
  });

  return messageId;
}

/** Removes _sentry metadata from consumer response messages. Returns a shallow copy if metadata was found. */
function cleanSentryMetadataFromResponse(res: SupabaseResponse): SupabaseResponse {
  if (!Array.isArray(res.data)) {
    return res;
  }

  const messages = res.data as SupabaseQueueMessage[];

  let hasMetadata = false;
  const cleanedData: SupabaseQueueMessage[] = [];

  for (const item of messages) {
    if (item?.message && typeof item.message === 'object' && '_sentry' in item.message) {
      hasMetadata = true;
      const messageCopy = { ...(item.message as Record<string, unknown>) };
      delete messageCopy._sentry;
      cleanedData.push({ ...item, message: messageCopy });
    } else {
      cleanedData.push(item);
    }
  }

  if (!hasMetadata) {
    return res;
  }

  return { ...res, data: cleanedData };
}

/** Instruments RPC consumer calls with queue.process spans and trace context extraction. */
function instrumentRpcConsumer(
  target: (...args: unknown[]) => unknown,
  thisArg: unknown,
  argumentsList: unknown[],
): unknown {
  if (!Array.isArray(argumentsList) || argumentsList.length < 2) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  if (typeof argumentsList[0] !== 'string') {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  const operationName = normalizeRpcFunctionName(argumentsList[0]);
  const queueParams = argumentsList[1];

  if (!isPlainObject(queueParams)) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  const typedParams = queueParams as { queue_name?: string; vt?: number; qty?: number };
  const queueName = typedParams.queue_name;

  if (!queueName) {
    return instrumentGenericRpc(target, thisArg, argumentsList);
  }

  return startSpan(
    {
      name: `process ${queueName}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase.queue.consumer',
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'queue.process',
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'task',
        'messaging.system': 'supabase',
        'messaging.destination.name': queueName,
        'messaging.operation.name': operationName,
        'messaging.operation.type': 'process',
      },
    },
    span => {
      const rpcPromise = Reflect.apply(target, thisArg, argumentsList) as Promise<SupabaseResponse>;

      return rpcPromise.then(
        (res: SupabaseResponse) => {
          if ((!res.data || (Array.isArray(res.data) && res.data.length === 0)) && !res.error) {
            span.setStatus({ code: SPAN_STATUS_OK });
            span.setAttribute('messaging.batch.message_count', 0);
            span.setAttribute('messaging.message.retry.count', 0);
            addBreadcrumb({
              type: 'supabase',
              category: 'queue.process',
              message: `queue.process(${queueName || 'unknown'})`,
              data: {
                'messaging.batch.message_count': 0,
                'messaging.destination.name': queueName,
              },
            });
            return res;
          }

          // Extract trace context from first message before cleanup
          const messages = Array.isArray(res.data) ? (res.data as SupabaseQueueMessage[]) : [];
          const firstMessage = messages[0]?.message;
          const sentryTrace = firstMessage?._sentry?.sentry_trace;

          const cleanedRes = cleanSentryMetadataFromResponse(res);

          if (sentryTrace) {
            const traceparentData = extractTraceparentData(sentryTrace);
            if (traceparentData?.traceId && traceparentData?.parentSpanId) {
              const traceFlags = traceparentData.parentSampled ? 1 : 0;

              span.addLink({
                context: {
                  traceId: traceparentData.traceId,
                  spanId: traceparentData.parentSpanId,
                  traceFlags,
                },
                attributes: { [SEMANTIC_LINK_ATTRIBUTE_LINK_TYPE]: 'queue.producer' },
              });
            }
          }

          const cleanedData = cleanedRes.data;
          if (!cleanedData || !Array.isArray(cleanedData)) {
            span.setAttribute('messaging.message.retry.count', 0);
            span.setStatus({ code: cleanedRes.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

            addBreadcrumb({
              type: 'supabase',
              category: 'queue.process',
              message: `queue.process(${queueName || 'unknown'})`,
              data: { 'messaging.destination.name': queueName },
            });

            if (cleanedRes.error) {
              captureQueueError(cleanedRes.error, queueName, 'auto.db.supabase.queue.consumer');
            }

            return cleanedRes;
          }

          const messageId = processConsumerSpanData(span, queueName, cleanedData as SupabaseQueueMessage[]);

          if (cleanedRes.error) {
            captureQueueError(cleanedRes.error, queueName, 'auto.db.supabase.queue.consumer', messageId);
          }

          span.setStatus({ code: cleanedRes.error ? SPAN_STATUS_ERROR : SPAN_STATUS_OK });

          return cleanedRes;
        },
        (err: unknown) => {
          addBreadcrumb({
            type: 'supabase',
            category: 'queue.process',
            message: `queue.process(${queueName || 'unknown'})`,
            data: { 'messaging.destination.name': queueName },
          });

          captureSupabaseError(err, 'auto.db.supabase.queue.consumer', { queueName });

          span.setStatus({ code: SPAN_STATUS_ERROR });
          throw err;
        },
      );
    },
  );
}

/** Creates a shared proxy handler that routes RPC calls to queue or generic instrumentation. */
function createRpcProxyHandler(): ProxyHandler<(...args: unknown[]) => unknown> {
  return {
    apply(target: (...args: unknown[]) => unknown, thisArg: unknown, argumentsList: unknown[]): unknown {
      try {
        const normalizedName = normalizeRpcFunctionName(argumentsList[0]);
        const isProducerSpan = normalizedName === 'send' || normalizedName === 'send_batch';
        const isConsumerSpan = normalizedName === 'pop' || normalizedName === 'receive' || normalizedName === 'read';

        if (isProducerSpan) {
          return instrumentRpcProducer(target, thisArg, argumentsList);
        }

        if (isConsumerSpan) {
          return instrumentRpcConsumer(target, thisArg, argumentsList);
        }

        return instrumentGenericRpc(target, thisArg, argumentsList);
      } catch (error) {
        DEBUG_BUILD && debug.warn('Supabase RPC instrumentation failed:', error);
        return Reflect.apply(target, thisArg, argumentsList);
      }
    },
  };
}

function instrumentGenericRpc(
  target: (...args: unknown[]) => unknown,
  thisArg: unknown,
  argumentsList: unknown[],
): unknown {
  const functionName = typeof argumentsList[0] === 'string' ? argumentsList[0] : 'unknown';
  const params = argumentsList[1];

  const builder = Reflect.apply(target, thisArg, argumentsList) as Record<string, unknown>;

  if (!builder || typeof builder.then !== 'function') {
    return builder;
  }

  const originalThen = (builder.then as (...args: unknown[]) => Promise<unknown>).bind(builder);

  // Shadow .then() on the instance so the span is only created when the builder is awaited.
  builder.then = function (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) {
    const attributes: Record<string, unknown> = {
      'db.system': 'postgresql',
      'db.operation': 'insert', // RPC calls use POST which maps to 'insert'
      'db.table': functionName,
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase',
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'db',
    };

    if (params && typeof params === 'object') {
      attributes['db.params'] = params;
    }

    return startSpan(
      {
        name: `rpc(${functionName})`,
        attributes: attributes as SpanAttributes,
      },
      span => {
        return (originalThen() as Promise<SupabaseResponse>)
          .then(
            (res: SupabaseResponse) => {
              if (span) {
                if (res && typeof res === 'object' && 'status' in res) {
                  setHttpStatus(span, res.status || 500);
                }

                if (res && typeof res === 'object' && 'error' in res && res.error && !('status' in res)) {
                  span.setStatus({ code: SPAN_STATUS_ERROR });
                }

                span.end();
              }

              const breadcrumb: SupabaseBreadcrumb = {
                type: 'supabase',
                category: 'db.insert',
                message: `rpc(${functionName})`,
              };

              if (params && typeof params === 'object') {
                breadcrumb.data = { body: params as Record<string, unknown> };
              }

              addBreadcrumb(breadcrumb);

              if (res && typeof res === 'object' && 'error' in res && res.error) {
                const error = res.error as { message?: string; code?: string; details?: string };
                const err = new Error(error.message || 'RPC error') as SupabaseError;
                if (error.code) err.code = error.code;
                if (error.details) err.details = error.details;

                captureSupabaseError(err, 'auto.db.supabase.rpc', {
                  function: functionName,
                  params,
                });
              }

              return res;
            },
            (err: Error) => {
              captureSupabaseError(err, 'auto.db.supabase.rpc', {
                function: functionName,
                params,
              });

              if (span) {
                setHttpStatus(span, 500);
                span.end();
              }
              throw err;
            },
          )
          .then(onfulfilled, onrejected);
      },
    );
  };

  return builder;
}

function instrumentRpcReturnedFromSchemaCall(SupabaseClient: unknown): void {
  const prototype = (SupabaseClient as SupabaseClientConstructor).prototype;
  if (!prototype.schema) {
    return;
  }
  if (isInstrumented(prototype.schema)) {
    return;
  }
  (SupabaseClient as SupabaseClientConstructor).prototype.schema = new Proxy(
    (SupabaseClient as SupabaseClientConstructor).prototype.schema,
    {
      apply(target, thisArg, argumentsList) {
        const supabaseInstance = Reflect.apply(target, thisArg, argumentsList);
        instrumentRpcMethod(supabaseInstance);
        return supabaseInstance;
      },
    },
  );
  markAsInstrumented((SupabaseClient as SupabaseClientConstructor).prototype.schema);
}

/** No guard needed — `.schema()` returns a fresh object each call. */
function instrumentRpcMethod(supabaseInstance: { rpc?: (...args: unknown[]) => unknown }): void {
  if (!supabaseInstance.rpc) {
    return;
  }

  supabaseInstance.rpc = new Proxy(supabaseInstance.rpc, createRpcProxyHandler());
}

function instrumentRpc(SupabaseClient: unknown): void {
  const prototype = (SupabaseClient as SupabaseClientConstructor).prototype;

  if (!prototype?.rpc) {
    return;
  }

  if (isInstrumented(prototype.rpc)) {
    return;
  }

  const wrappedRpc = new Proxy(prototype.rpc, createRpcProxyHandler());
  prototype.rpc = wrappedRpc;

  markAsInstrumented(prototype.rpc);
}

export const instrumentSupabaseClient = (supabaseClient: unknown): void => {
  if (!supabaseClient) {
    DEBUG_BUILD && debug.warn('Supabase integration was not installed because no Supabase client was provided.');
    return;
  }
  const SupabaseClientConstructor =
    supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor;

  instrumentSupabaseClientConstructor(SupabaseClientConstructor);
  instrumentRpcReturnedFromSchemaCall(SupabaseClientConstructor);
  instrumentRpc(SupabaseClientConstructor);
  instrumentSupabaseAuthClient(supabaseClient as SupabaseClientInstance);
};

const INTEGRATION_NAME = 'Supabase';

const _supabaseIntegration = ((supabaseClient: unknown) => {
  return {
    setupOnce() {
      instrumentSupabaseClient(supabaseClient);
    },
    name: INTEGRATION_NAME,
  };
}) satisfies IntegrationFn;

export const supabaseIntegration = defineIntegration((options: { supabaseClient: any }) => {
  return _supabaseIntegration(options.supabaseClient);
}) satisfies IntegrationFn;
