import { getCurrentHub } from '@sentry/core';
import { normalize } from '@sentry/utils';

interface SentryTrpcMiddlewareOptions {
  attachRpcInput?: boolean;
}

interface TrpcMiddlewareArguments<T> {
  path: string;
  type: 'query' | 'mutation' | 'subscription';
  next: () => Promise<T>;
  rawInput: unknown;
}

/**
 * Sentry tRPC middleware that names the handling transaction after the called procedure.
 *
 * Use the Sentry tRPC middleware in combination with the Sentry server integration. (e.g. express integration or
 * Next.js SDK)
 */
export async function sentryTrpcMiddleware(options: SentryTrpcMiddlewareOptions) {
  return async function <T>({ path, type, next, rawInput }: TrpcMiddlewareArguments<T>): Promise<T> {
    const hub = getCurrentHub();
    const clientOptions = hub.getClient()?.getOptions();
    const sentryTransaction = hub.getScope()?.getTransaction();

    if (sentryTransaction) {
      sentryTransaction.setName(`${path}()`, 'route');
      sentryTransaction.op = 'rpc.server';

      const trpcData: Record<string, unknown> = {
        procedureType: type,
      };

      if (options.attachRpcInput !== undefined ? options.attachRpcInput : clientOptions?.sendDefaultPii) {
        trpcData.procedureInput = normalize(rawInput);
      }

      sentryTransaction.setData('trpc', trpcData);
    }

    return await next();
  };
}
