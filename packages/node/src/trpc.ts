import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, captureException, getClient, getCurrentScope } from '@sentry/core';
import { isThenable, normalize } from '@sentry/utils';

interface SentryTrpcMiddlewareOptions {
  /** Whether to include procedure inputs in reported events. Defaults to `false`. */
  attachRpcInput?: boolean;
}

interface TrpcMiddlewareArguments<T> {
  path: string;
  type: string;
  next: () => T;
  rawInput: unknown;
}

/**
 * Sentry tRPC middleware that names the handling transaction after the called procedure.
 *
 * Use the Sentry tRPC middleware in combination with the Sentry server integration,
 * e.g. Express Request Handlers or Next.js SDK.
 */
export function trpcMiddleware(options: SentryTrpcMiddlewareOptions = {}) {
  return function <T>({ path, type, next, rawInput }: TrpcMiddlewareArguments<T>): T {
    const clientOptions = getClient()?.getOptions();
    // eslint-disable-next-line deprecation/deprecation
    const sentryTransaction = getCurrentScope().getTransaction();

    if (sentryTransaction) {
      sentryTransaction.updateName(`trpc/${path}`);
      sentryTransaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
      sentryTransaction.op = 'rpc.server';

      const trpcContext: Record<string, unknown> = {
        procedure_type: type,
      };

      if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions?.sendDefaultPii) {
        trpcContext.input = normalize(rawInput);
      }

      // TODO: Can we rewrite this to an attribute? Or set this on the scope?
      // eslint-disable-next-line deprecation/deprecation
      sentryTransaction.setContext('trpc', trpcContext);
    }

    function captureIfError(nextResult: { ok: false; error?: Error } | { ok: true }): void {
      if (!nextResult.ok) {
        captureException(nextResult.error, { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } });
      }
    }

    let maybePromiseResult;
    try {
      maybePromiseResult = next();
    } catch (e) {
      captureException(e, { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } });
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Promise.resolve(maybePromiseResult).then(
        nextResult => {
          captureIfError(nextResult as any);
        },
        e => {
          captureException(e, { mechanism: { handled: false, data: { function: 'trpcMiddleware' } } });
        },
      );
    } else {
      captureIfError(maybePromiseResult as any);
    }

    // We return the original promise just to be safe.
    return maybePromiseResult;
  };
}
