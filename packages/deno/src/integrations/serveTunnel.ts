import { subscribe } from 'node:diagnostics_channel';
import type { IntegrationFn, ServerTunnelOptions } from '@sentry/core';
import { debug, defineIntegration } from '@sentry/core';
import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_instrumentTunnelServer as instrumentTunnelServer,
  HTTP_ON_SERVER_REQUEST,
  serveTunnelIntegration as coreServeTunnelIntegration,
} from '@sentry/core/server';

type ServeHandler = (request: Request, info: Deno.ServeHandlerInfo<Deno.Addr>) => Response | Promise<Response>;

let hasPatchedDenoServe = false;

const _serveTunnelIntegration = ((options: ServerTunnelOptions = {}) => {
  const integration = coreServeTunnelIntegration(options);

  return {
    ...integration,
    setupOnce() {
      if (options.intercept === false) {
        return;
      }

      // `node:http` servers publish the same channel on Deno as on Node.
      subscribe(HTTP_ON_SERVER_REQUEST, instrumentTunnelServer);
      patchDenoServe();
    },
  };
}) satisfies IntegrationFn;

/**
 * Lets your server forward the events of a browser SDK set up with `tunnel: true` to Sentry.
 *
 * With this integration on the server and `tunnel: true` in the browser `init`, the browser sends its events to your
 * own server instead of Sentry, where ad-blockers can't drop them, and your server forwards them to Sentry.
 *
 * `Deno.serve` (including `deno serve`) and `node:http` servers answer the tunnel requests before the app sees them.
 * To serve them from your own code instead, set `intercept: false` and call `handleTunnelRequestIfMatched`.
 *
 * By default only envelopes for the server's own DSN are forwarded.
 *
 * @example
 * ```js
 * // Server
 * Sentry.init({
 *   dsn: '__DSN__',
 *   integrations: [Sentry.serveTunnelIntegration()],
 * });
 *
 * // Browser
 * Sentry.init({
 *   dsn: '__DSN__',
 *   tunnel: true,
 * });
 * ```
 */
export const serveTunnelIntegration = defineIntegration(_serveTunnelIntegration);

/**
 * Answers tunnel requests ahead of every `Deno.serve` handler. `deno serve` starts the default export through the
 * same global, so it's covered too.
 */
function patchDenoServe(): void {
  if (hasPatchedDenoServe) {
    return;
  }

  try {
    const originalServe = Deno.serve;
    const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve');
    // `Deno.serve` is a getter, so it can't be assigned.
    Object.defineProperty(Deno, 'serve', {
      configurable: descriptor?.configurable ?? true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value: function (this: unknown, ...args: unknown[]) {
        return originalServe.apply(this, withTunnelHandler(args));
      },
    });
    hasPatchedDenoServe = true;
  } catch (error) {
    debug.warn('Sentry tunnel: could not patch Deno.serve', error);
  }
}

/**
 * Wraps the handler of `Deno.serve(handler)`, `Deno.serve(options, handler)` or `Deno.serve({ handler })`. Returns
 * the arguments as they were if anything goes wrong, so the server still starts.
 */
function withTunnelHandler(args: unknown[]): unknown[] {
  try {
    const handlerIndex = args.findIndex(arg => typeof arg === 'function');
    if (handlerIndex !== -1) {
      const wrapped = [...args];
      wrapped[handlerIndex] = wrapHandler(args[handlerIndex] as ServeHandler);

      return wrapped;
    }

    const [options, ...rest] = args as [{ handler?: unknown } | undefined, ...unknown[]];
    if (options && typeof options.handler === 'function') {
      return [{ ...options, handler: wrapHandler(options.handler as ServeHandler) }, ...rest];
    }
  } catch (error) {
    debug.warn('Sentry tunnel: could not wrap the Deno.serve handler', error);
  }

  return args;
}

function wrapHandler(handler: ServeHandler): ServeHandler {
  return function (this: unknown, request, info) {
    return handleServedTunnelRequest(request) ?? handler.call(this, request, info);
  };
}
