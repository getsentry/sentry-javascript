import { subscribe } from 'node:diagnostics_channel';
import { debug } from '@sentry/core';
import {
  _INTERNAL_handleServedTunnelRequest as handleServedTunnelRequest,
  _INTERNAL_instrumentTunnelServer as instrumentTunnelServer,
  HTTP_ON_SERVER_REQUEST,
} from '@sentry/core/server';

type ServeHandler = (request: Request, info: Deno.ServeHandlerInfo<Deno.Addr>) => Response | Promise<Response>;

let hasPatchedDenoServe = false;
let isSubscribed = false;

/**
 * Lets `Deno.serve` (including `deno serve`) and `node:http` servers answer managed tunnel requests before the app
 * sees them. Nothing is answered unless the tunnel is on, through `serveTunnelIntegration` or a framework SDK. A
 * `Deno.serve` server started before `init` isn't covered.
 */
export function instrumentTunnelServers(): void {
  if (!isSubscribed) {
    isSubscribed = true;
    // `node:http` servers publish the same channel on Deno as on Node.
    subscribe(HTTP_ON_SERVER_REQUEST, instrumentTunnelServer);
  }

  patchDenoServe();
}

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
