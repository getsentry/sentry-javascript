import type { ExportedHandler } from '@cloudflare/workers-types';
import type { CloudflareOptions } from '../../client';
import { isInstrumented, markAsInstrumented } from '../../instrument';
import { getFinalOptions } from '../../options';
import { wrapRequestHandler } from '../../request';
import { instrumentContext } from '../../utils/instrumentContext';

/**
 * Instruments a fetch handler for ExportedHandler (env/ctx come from args).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function instrumentExportedHandlerFetch<T extends ExportedHandler<any, any, any>>(
  handler: T,
  optionsCallback: (env: Parameters<NonNullable<T['fetch']>>[1]) => CloudflareOptions | undefined,
): void {
  if (!('fetch' in handler) || typeof handler.fetch !== 'function' || isInstrumented(handler.fetch)) {
    return;
  }

  handler.fetch = new Proxy(handler.fetch, {
    apply(target, thisArg, args: Parameters<NonNullable<T['fetch']>>) {
      const [request, env, ctx] = args;
      const context = instrumentContext(ctx);
      args[2] = context;

      const options = getFinalOptions(optionsCallback(env), env);

      return wrapRequestHandler({ options, request, context }, () => target.apply(thisArg, args));
    },
  });

  markAsInstrumented(handler.fetch);
}
