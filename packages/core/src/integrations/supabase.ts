// Based on Kamil Ogórek's work on:
// https://github.com/supabase-community/sentry-integration-js

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-lines */
import { addBreadcrumb } from '../breadcrumbs';
import { DEBUG_BUILD } from '../debug-build';
import { captureException } from '../exports';
import { defineIntegration } from '../integration';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../semanticAttributes';
import { setHttpStatus, SPAN_STATUS_ERROR, SPAN_STATUS_OK, startSpan } from '../tracing';
import type { IntegrationFn } from '../types-hoist/integration';
import { debug } from '../utils/debug-logger';
import { isPlainObject } from '../utils/is';
import { addExceptionMechanism } from '../utils/misc';

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

export const instrumentSupabaseClient = (supabaseClient: unknown): void => {
  if (!supabaseClient) {
    DEBUG_BUILD && debug.warn('Supabase integration was not installed because no Supabase client was provided.');
    return;
  }
  const SupabaseClientConstructor =
    supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor;

  instrumentSupabaseClientConstructor(SupabaseClientConstructor);
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
