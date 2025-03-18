import {
  addBreadcrumb,
  captureException,
  defineIntegration,
  startInactiveSpan,
  setHttpStatus,
  logger,
  isPlainObject,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
} from '@sentry/core';

import type { Span, IntegrationFn } from '@sentry/core';
import type {
  SupabaseBreadcrumb,
  SupabaseError,
  SupabaseResponse,
  SupabaseClient,
  PostgrestQueryBuilder,
  PostgrestFilterBuilder,
} from './types';
import { AVAILABLE_OPERATIONS } from './constants';
import { extractOperation, translateFiltersIntoMethods } from './utils';

const instrumented = new Map();

function instrumentSupabaseClient(SupabaseClient: unknown): void {
  if (instrumented.has(SupabaseClient)) {
    return;
  }

  instrumented.set(SupabaseClient, {
    from: (SupabaseClient as unknown as SupabaseClient).prototype.from,
  });

  (SupabaseClient as unknown as SupabaseClient).prototype.from = new Proxy(
    (SupabaseClient as unknown as SupabaseClient).prototype.from,
    {
      apply(target, thisArg, argumentsList) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgrestQueryBuilder = (rv as PostgrestQueryBuilder).constructor;

        instrumentPostgrestQueryBuilder(PostgrestQueryBuilder as unknown as new () => PostgrestQueryBuilder);

        return rv;
      },
    },
  );
}

// This is the only "instrumented" part of the SDK. The rest of instrumentation
// methods are only used as a mean to get to the `PostgrestFilterBuilder` constructor itself.
function instrumentPostgrestFilterBuilder(PostgrestFilterBuilder: PostgrestFilterBuilder['constructor']): void {
  if (instrumented.has(PostgrestFilterBuilder)) {
    return;
  }

  instrumented.set(PostgrestFilterBuilder, {
    then: (
      PostgrestFilterBuilder.prototype as unknown as {
        then: <T>(
          onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
          onrejected?: ((reason: any) => T | PromiseLike<T>) | null,
        ) => Promise<T>;
      }
    ).then,
  });

  (
    PostgrestFilterBuilder.prototype as unknown as {
      then: <T>(
        onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
        onrejected?: ((reason: any) => T | PromiseLike<T>) | null,
      ) => Promise<T>;
    }
  ).then = new Proxy(
    (
      PostgrestFilterBuilder.prototype as unknown as {
        then: <T>(
          onfulfilled?: ((value: T) => T | PromiseLike<T>) | null,
          onrejected?: ((reason: any) => T | PromiseLike<T>) | null,
        ) => Promise<T>;
      }
    ).then,
    {
      apply(target, thisArg, argumentsList) {
        const operations = AVAILABLE_OPERATIONS;
        const typedThis = thisArg as PostgrestFilterBuilder;
        const operation = extractOperation(typedThis.method, typedThis.headers);

        if (!operations.includes(operation)) {
          return Reflect.apply(target, thisArg, argumentsList);
        }

        if (!typedThis?.url?.pathname || typeof typedThis.url.pathname !== 'string') {
          return Reflect.apply(target, thisArg, argumentsList);
        }

        const pathParts = typedThis.url.pathname.split('/');
        const table = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
        const description = `from(${table})`;

        const query: string[] = [];
        for (const [key, value] of typedThis.url.searchParams.entries()) {
          // It's possible to have multiple entries for the same key, eg. `id=eq.7&id=eq.3`,
          // so we need to use array instead of object to collect them.
          query.push(translateFiltersIntoMethods(key, value));
        }

        const body: Record<string, unknown> = {};
        if (isPlainObject(typedThis.body)) {
          for (const [key, value] of Object.entries(typedThis.body)) {
            body[key] = value;
          }
        }

        // TODO / Should?
        const shouldCreateSpan = true;

        let span: Span | undefined;

        if (shouldCreateSpan) {
          const attributes: Record<string, any> = {
            'db.table': table,
            'db.schema': typedThis.schema,
            'db.url': typedThis.url.origin,
            'db.sdk': typedThis.headers['X-Client-Info'],
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.db.supabase',
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `db.${operation}`,
          };

          if (query.length) {
            attributes['db.query'] = query;
          }

          if (Object.keys(body).length) {
            attributes['db.body'] = body;
          }

          span = startInactiveSpan({
            name: description,
            attributes,
          });
        }

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

                const supabaseContext: Record<string, unknown> = {};
                if (query.length) {
                  supabaseContext.query = query;
                }
                if (Object.keys(body).length) {
                  supabaseContext.body = body;
                }

                captureException(err, {
                  contexts: {
                    supabase: supabaseContext,
                  },
                });
              }

              // Todo / Should?
              const shouldCreateBreadcrumb = true;

              if (shouldCreateBreadcrumb) {
                const breadcrumb: SupabaseBreadcrumb = {
                  type: 'supabase',
                  category: `db.${operation}`,
                  message: description,
                };

                const data: Record<string, unknown> = {};

                if (query.length) {
                  data.query = query;
                }

                if (Object.keys(body).length) {
                  data.body = body;
                }

                if (Object.keys(data).length) {
                  breadcrumb.data = data;
                }

                addBreadcrumb(breadcrumb);
              }

              return res;
            },
            (err: Error) => {
              if (span) {
                setHttpStatus(span, 500);
                span.end();
              }
              throw err;
            },
          )
          .then(...argumentsList);
      },
    },
  );
}

function instrumentPostgrestQueryBuilder(PostgrestQueryBuilder: new () => PostgrestQueryBuilder): void {
  if (instrumented.has(PostgrestQueryBuilder)) {
    return;
  }

  // We need to wrap _all_ operations despite them sharing the same `PostgrestFilterBuilder`
  // constructor, as we don't know which method will be called first, an we don't want to miss any calls.
  for (const operation of AVAILABLE_OPERATIONS) {
    logger.log(`Instrumenting ${operation} operation`);

    instrumented.set(PostgrestQueryBuilder, {
      [operation]: (PostgrestQueryBuilder.prototype as Record<string, unknown>)[
        operation as 'select' | 'insert' | 'upsert' | 'update' | 'delete'
      ] as (...args: unknown[]) => PostgrestFilterBuilder,
    });

    type PostgrestOperation = keyof Pick<PostgrestQueryBuilder, 'select' | 'insert' | 'upsert' | 'update' | 'delete'>;
    (PostgrestQueryBuilder.prototype as Record<string, any>)[operation as PostgrestOperation] = new Proxy(
      (PostgrestQueryBuilder.prototype as Record<string, any>)[operation as PostgrestOperation],
      {
        apply(target, thisArg, argumentsList) {
          const rv = Reflect.apply(target, thisArg, argumentsList);
          const PostgrestFilterBuilder = (rv as PostgrestFilterBuilder).constructor;

          logger.log(`Instrumenting ${operation} operation's PostgrestFilterBuilder`);

          instrumentPostgrestFilterBuilder(PostgrestFilterBuilder);

          return rv;
        },
      },
    );
  }
}

export const patchCreateClient = (moduleExports: { createClient?: (...args: unknown[]) => unknown }): void => {
  const originalCreateClient = moduleExports.createClient;
  if (!originalCreateClient) {
    return;
  }

  moduleExports.createClient = function wrappedCreateClient(...args: any[]) {
    const client = originalCreateClient.apply(this, args);

    instrumentSupabaseClient(client);

    return client;
  };
};

const instrumentSupabase = (supabaseClient: unknown): void => {
  if (!supabaseClient) {
    throw new Error('SupabaseClient class constructor is required');
  }

  // We want to allow passing either `SupabaseClient` constructor
  // or an instance returned from `createClient()`.
  const SupabaseClient = supabaseClient.constructor === Function ? supabaseClient : supabaseClient.constructor;

  instrumentSupabaseClient(SupabaseClient);
};

const INTEGRATION_NAME = 'Supabase';

const _supabaseIntegration = (({ supabaseClient } = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentSupabase(supabaseClient);
    },
  };
}) satisfies IntegrationFn;

export const supabaseIntegration = defineIntegration((options: { supabaseClient: unknown }) => {
  return {
    ..._supabaseIntegration(options),
    name: INTEGRATION_NAME,
  };
}) satisfies IntegrationFn;
