import { isThenable, normalize } from '@sentry/utils';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  setContext,
  startSpanManual,
} from '.';
import { getClient } from './currentScopes';

interface SentryTrpcMiddlewareOptions {
  /** Whether to include procedure inputs in reported events. Defaults to `false`. */
  attachRpcInput?: boolean;
}

export interface SentryTrpcMiddlewareArguments<T> {
  path?: unknown;
  type?: unknown;
  next: () => T;
  rawInput?: unknown;
}

const trpcCaptureContext = { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } };

/**
 * Sentry tRPC middleware that captures errors and creates spans for tRPC procedures.
 */
export function trpcMiddleware(options: SentryTrpcMiddlewareOptions = {}) {
  return function <T>(opts: SentryTrpcMiddlewareArguments<T>): T {
    const { path, type, next, rawInput } = opts;
    const client = getClient();
    const clientOptions = client && client.getOptions();

    const trpcContext: Record<string, unknown> = {
      procedure_type: type,
    };

    if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions && clientOptions.sendDefaultPii) {
      trpcContext.input = normalize(rawInput);
    }

    setContext('trpc', trpcContext);

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

    return startSpanManual(
      {
        name: `trpc/${path}`,
        op: 'rpc.server',
        forceTransaction: true,
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.rpc.trpc',
        },
      },
      span => {
        let maybePromiseResult;
        try {
          maybePromiseResult = next();
        } catch (e) {
          captureException(e, trpcCaptureContext);
          span.end();
          throw e;
        }

        if (isThenable(maybePromiseResult)) {
          return maybePromiseResult.then(
            nextResult => {
              captureIfError(nextResult);
              span.end();
              return nextResult;
            },
            e => {
              captureException(e, trpcCaptureContext);
              span.end();
              throw e;
            },
          ) as T;
        } else {
          captureIfError(maybePromiseResult);
          span.end();
          return maybePromiseResult;
        }
      },
    );
  };
}
