import { getCurrentHub } from '@sentry/core';
import { normalize } from '@sentry/utils';

interface SentryTrpcMiddlewareOptions {
  attachRpcInput?: boolean;
}

interface TrpcMiddlewareArguments<T> {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  next: () => T;
  rawInput: unknown;
}

/**
 * Sentry tRPC middleware that names the handling transaction after the called procedure.
 *
 * Use the Sentry tRPC middleware in combination with the Sentry server integration,
 * e.g. Express Request Handlers or Next.js SDK.
 */
export async function trpcMiddleware(options: SentryTrpcMiddlewareOptions = {}) {
  return function <T>({ path, type, next, rawInput }: TrpcMiddlewareArguments<T>): T {
    const hub = getCurrentHub();
    const clientOptions = hub.getClient()?.getOptions();
    const sentryTransaction = hub.getScope()?.getTransaction();

    if (sentryTransaction) {
      sentryTransaction.setName(`trcp/${path}`, 'route');
      sentryTransaction.op = 'rpc.server';

      const trpcData: Record<string, unknown> = {
        procedureType: type,
      };

      if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions?.sendDefaultPii) {
        trpcData.procedureInput = normalize(rawInput);
      }

      sentryTransaction.setData('trpc', trpcData);
    }

    return next();
  };
}
