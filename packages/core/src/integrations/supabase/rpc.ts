import { addBreadcrumb } from '../../breadcrumbs';
import { DEBUG_BUILD } from '../../debug-build';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '../../semanticAttributes';
import { setHttpStatus, SPAN_STATUS_ERROR, startSpan } from '../../tracing';
import type { SpanAttributes } from '../../types-hoist/span';
import { debug } from '../../utils/debug-logger';
import { captureSupabaseError } from './errors';
import { _instrumentRpcConsumer } from './queue-consumer';
import { _instrumentRpcProducer } from './queue-producer';
import type {
  SupabaseBreadcrumb,
  SupabaseClientConstructorType,
  SupabaseClientInstance,
  SupabaseError,
  SupabaseResponse,
} from './types';
import { _isInstrumented, _markAsInstrumented, _normalizeRpcFunctionName } from './utils';

/** Creates a shared proxy handler that routes RPC calls to queue or generic instrumentation. */
function _createRpcProxyHandler(): ProxyHandler<(...args: unknown[]) => Promise<unknown>> {
  return {
    apply(
      target: (...args: unknown[]) => Promise<unknown>,
      thisArg: unknown,
      argumentsList: unknown[],
    ): Promise<unknown> {
      try {
        const normalizedName = _normalizeRpcFunctionName(argumentsList[0]);
        const isProducerSpan = normalizedName === 'send' || normalizedName === 'send_batch';
        const isConsumerSpan = normalizedName === 'pop' || normalizedName === 'receive' || normalizedName === 'read';

        if (!isProducerSpan && !isConsumerSpan) {
          return _instrumentGenericRpc(target, thisArg, argumentsList);
        }

        if (isProducerSpan) {
          return _instrumentRpcProducer(target, thisArg, argumentsList);
        }

        return _instrumentRpcConsumer(target, thisArg, argumentsList);
      } catch (error) {
        DEBUG_BUILD && debug.warn('Supabase queue instrumentation failed:', error);
        return Reflect.apply(target, thisArg, argumentsList);
      }
    },
  };
}

/** Instruments generic (non-queue) RPC calls with db spans. */
export function _instrumentGenericRpc(
  target: (...args: unknown[]) => Promise<unknown>,
  thisArg: unknown,
  argumentsList: unknown[],
): Promise<unknown> {
  const functionName = typeof argumentsList[0] === 'string' ? argumentsList[0] : 'unknown';
  const params = argumentsList[1];

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
      return (Reflect.apply(target, thisArg, argumentsList) as Promise<SupabaseResponse>).then(
        (res: SupabaseResponse) => {
          if (span && res && typeof res === 'object' && 'status' in res) {
            setHttpStatus(span, res.status || 500);
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

            if (span) {
              span.setStatus({ code: SPAN_STATUS_ERROR });
            }

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
          }
          throw err;
        },
      );
    },
  );
}

/** Instruments RPC methods returned from `.schema()` calls. */
export function _instrumentRpcReturnedFromSchemaCall(SupabaseClient: unknown): void {
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

/** Instruments RPC method on a Supabase instance (from `.schema()` — no guard needed, each call returns a fresh object). */
function _instrumentRpcMethod(supabaseInstance: SupabaseClientConstructorType): void {
  const instance = supabaseInstance as unknown as SupabaseClientInstance;

  if (!instance.rpc) {
    return;
  }

  instance.rpc = new Proxy(instance.rpc, _createRpcProxyHandler());
}

/** Instruments direct RPC calls on a Supabase client's constructor prototype. */
export function _instrumentRpc(SupabaseClientConstructor: unknown): void {
  const prototype = (SupabaseClientConstructor as SupabaseClientConstructorType).prototype;

  if (!prototype?.rpc) {
    return;
  }

  if (_isInstrumented(prototype.rpc)) {
    return;
  }

  const wrappedRpc = new Proxy(prototype.rpc, _createRpcProxyHandler());
  prototype.rpc = wrappedRpc;

  _markAsInstrumented(prototype.rpc);
}
