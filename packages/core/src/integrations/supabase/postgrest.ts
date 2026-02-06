import { addBreadcrumb } from '../../breadcrumbs';
import { DEBUG_BUILD } from '../../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { setHttpStatus, startInactiveSpan, withActiveSpan } from '../../tracing';
import type { SpanAttributes } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import { isPlainObject } from '../../utils/is';
import { DB_OPERATIONS_TO_INSTRUMENT, QUEUE_RPC_OPERATIONS } from './constants';
import { captureSupabaseError } from './errors';
import type {
  PostgRESTFilterBuilder,
  PostgRESTProtoThenable,
  PostgRESTQueryBuilder,
  PostgRESTQueryOperationFn,
  SupabaseBreadcrumb,
  SupabaseClientConstructorType,
  SupabaseError,
  SupabaseResponse,
} from './types';
import {
  _isInstrumented,
  _markAsInstrumented,
  _normalizeRpcFunctionName,
  extractOperation,
  translateFiltersIntoMethods,
} from './utils';

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
    get(target, prop) {
      if (prop === '__SENTRY_INSTRUMENTED__') {
        return true;
      }
      return Reflect.get(target, prop);
    },
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

      // Use startInactiveSpan + withActiveSpan to ensure span.end() is called BEFORE user callbacks
      // This is critical for proper span ordering - otherwise span.end() happens after user's await
      // continuation, which can cause the root transaction to end before child spans
      const span = startInactiveSpan({
        name: description,
        attributes: attributes as SpanAttributes,
      });

      // Run the operation with the span as active (for HTTP child spans)
      return withActiveSpan(span, () => {
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

                captureSupabaseError(err, 'auto.db.supabase.postgres', supabaseContext);
              }

              return res;
            },
            (err: Error) => {
              captureSupabaseError(err, 'auto.db.supabase.postgres', {
                operation: operation,
                table: table,
              });

              if (span) {
                setHttpStatus(span, 500);
                span.end();
              }
              throw err;
            },
          )
          .then(...argumentsList);
      });
    },
  });
}

/** Instruments the PostgRESTFilterBuilder prototype's `.then()` method. */
export function _instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilder: PostgRESTFilterBuilder['constructor']): void {
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
  // Note: We don't call _markAsInstrumented here because the Proxy's get handler
  // returns true for __SENTRY_INSTRUMENTED__, which correctly identifies it as instrumented
}

/** Instruments a PostgRESTFilterBuilder instance's `.then()` when defined as an own property. */
export function _instrumentPostgRESTFilterBuilderInstance(builder: PostgRESTFilterBuilder): void {
  if (!builder || typeof builder !== 'object') {
    return;
  }

  const thenable = builder as unknown as PostgRESTProtoThenable;
  const originalThen = thenable?.then;

  if (typeof originalThen !== 'function') {
    return;
  }

  // Skip if already instrumented (whether from prototype or own property)
  if (_isInstrumented(originalThen)) {
    return;
  }

  thenable.then = _createInstrumentedPostgRESTThen(originalThen);
  // Note: We don't call _markAsInstrumented here because the Proxy's get handler
  // returns true for __SENTRY_INSTRUMENTED__, which correctly identifies it as instrumented
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
export function _instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilder: new () => PostgRESTQueryBuilder): void {
  // We need to wrap _all_ operations despite them sharing the same `PostgRESTFilterBuilder`
  // constructor, as we don't know which method will be called first, and we don't want to miss any calls.
  for (const operation of DB_OPERATIONS_TO_INSTRUMENT) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prototypeWithOps = PostgRESTQueryBuilder.prototype as Record<string, any>;

    if (_isInstrumented(prototypeWithOps[operation])) {
      continue;
    }

    if (!prototypeWithOps[operation]) {
      continue;
    }

    prototypeWithOps[operation] = new Proxy(prototypeWithOps[operation], {
      apply(target: PostgRESTQueryOperationFn, thisArg: unknown, argumentsList: Parameters<PostgRESTQueryOperationFn>) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTFilterBuilderCtor = rv.constructor;

        DEBUG_BUILD && debug.log(`Instrumenting ${operation} operation's PostgRESTFilterBuilder`);

        _instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilderCtor);
        _instrumentPostgRESTFilterBuilderInstance(rv);

        return rv;
      },
    });

    _markAsInstrumented(prototypeWithOps[operation]);
  }
}

/**
 * Instruments a QueryBuilder instance's methods directly.
 * This handles the case where methods are defined as instance properties (arrow functions)
 * rather than prototype methods, which can't be caught by prototype instrumentation.
 *
 * @param queryBuilder - The QueryBuilder instance to instrument
 */
export function _instrumentQueryBuilderInstance(queryBuilder: PostgRESTQueryBuilder): void {
  for (const operation of DB_OPERATIONS_TO_INSTRUMENT) {
    const instanceMethod = queryBuilder[operation];

    // Skip if method doesn't exist or is not an own property (already using prototype)
    if (!instanceMethod || !Object.prototype.hasOwnProperty.call(queryBuilder, operation)) {
      continue;
    }

    if (_isInstrumented(instanceMethod)) {
      continue;
    }

    const wrappedOperation = new Proxy(instanceMethod, {
      apply(target: PostgRESTQueryOperationFn, thisArg: unknown, argumentsList: Parameters<PostgRESTQueryOperationFn>) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTFilterBuilderCtor = rv.constructor;

        DEBUG_BUILD && debug.log(`Instrumenting ${operation} operation's PostgRESTFilterBuilder`);

        _instrumentPostgRESTFilterBuilder(PostgRESTFilterBuilderCtor);
        _instrumentPostgRESTFilterBuilderInstance(rv);

        return rv;
      },
    });

    queryBuilder[operation] = wrappedOperation;
    _markAsInstrumented(wrappedOperation);
  }
}

/** Instruments the Supabase client constructor's `.from()` method to trace database queries. */
export function _instrumentSupabaseClientConstructor(SupabaseClient: unknown): void {
  if (_isInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.from)) {
    return;
  }

  (SupabaseClient as SupabaseClientConstructorType).prototype.from = new Proxy(
    (SupabaseClient as SupabaseClientConstructorType).prototype.from,
    {
      apply(target, thisArg, argumentsList) {
        const rv = Reflect.apply(target, thisArg, argumentsList);
        const PostgRESTQueryBuilderCtor = (rv as PostgRESTQueryBuilder).constructor;

        // Instrument both prototype (for prototype-based methods) and instance (for arrow functions)
        _instrumentPostgRESTQueryBuilder(PostgRESTQueryBuilderCtor as unknown as new () => PostgRESTQueryBuilder);
        _instrumentQueryBuilderInstance(rv as PostgRESTQueryBuilder);

        return rv;
      },
    },
  );

  _markAsInstrumented((SupabaseClient as SupabaseClientConstructorType).prototype.from);
}
