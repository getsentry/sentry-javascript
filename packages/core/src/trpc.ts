import { getClient, withIsolationScope } from './currentScopes';
import { captureException } from './exports';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from './semanticAttributes';
import { startSpanManual } from './tracing';
import { normalize } from './utils/normalize';
import { addNonEnumerableProperty } from './utils/object';

interface SentryTrpcMiddlewareOptions {
  /** Whether to include procedure inputs in reported events. Defaults to `false`. */
  attachRpcInput?: boolean;
  forceTransaction?: boolean;
}

export interface SentryTrpcMiddlewareArguments<T> {
  path?: unknown;
  type?: unknown;
  next: () => T;
  rawInput?: unknown;
  getRawInput?: () => Promise<unknown>;
}

const trpcCaptureContext = { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } };

function captureIfError(nextResult: unknown): void {
  // TODO: Set span status based on what TRPCError was encountered
  if (
    typeof nextResult === 'object' &&
    nextResult !== null &&
    'ok' in nextResult &&
    !nextResult.ok &&
    'error' in nextResult
  ) {
    captureException(nextResult.error, trpcCaptureContext);
  }
}

type SentryTrpcMiddleware<T> = T extends Promise<unknown> ? T : Promise<T>;

/**
 * Sentry tRPC middleware that captures errors and creates spans for tRPC procedures.
 */
export function trpcMiddleware(options: SentryTrpcMiddlewareOptions = {}) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return async function <T>(opts: SentryTrpcMiddlewareArguments<T>): SentryTrpcMiddleware<T> {
    const { path, type, next, rawInput, getRawInput } = opts;

    const client = getClient();
    const clientOptions = client?.getOptions();

    const trpcContext: Record<string, unknown> = {
      procedure_path: path,
      procedure_type: type,
    };

    addNonEnumerableProperty(
      trpcContext,
      '__sentry_override_normalization_depth__',
      1 + // 1 for context.input + the normal normalization depth
        (clientOptions?.normalizeDepth ?? 5), // 5 is a sane depth
    );

    if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions?.sendDefaultPii) {
      if (rawInput !== undefined) {
        trpcContext.input = normalize(rawInput);
      }

      if (getRawInput !== undefined && typeof getRawInput === 'function') {
        try {
          const rawRes = await getRawInput();

          trpcContext.input = normalize(rawRes);
        } catch {
          // noop
        }
      }
    }

    return withIsolationScope(scope => {
      scope.setContext('trpc', trpcContext);
      return startSpanManual(
        {
          name: `trpc/${path}`,
          op: 'rpc.server',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.rpc.trpc',
          },
          forceTransaction: !!options.forceTransaction,
        },
        async span => {
          try {
            const nextResult = await next();
            captureIfError(nextResult);
            span.end();
            return nextResult;
          } catch (e) {
            captureException(e, trpcCaptureContext);
            span.end();
            throw e;
          }
        },
      ) as SentryTrpcMiddleware<T>;
    });
  };
}
