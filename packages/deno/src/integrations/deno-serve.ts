import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '../async';
import type { RequestHandlerWrapperOptions } from '../wrap-deno-request-handler';
import { wrapDenoRequestHandler } from '../wrap-deno-request-handler';

const INTEGRATION_NAME = 'DenoServe';

export type ServeParams =
  // [(Request) => Response]
  | [Deno.ServeHandler<Deno.NetAddr>]
  // [{ options }, (Request) => Response]
  | [Deno.ServeUnixOptions, Deno.ServeHandler<Deno.UnixAddr>]
  | [Deno.ServeVsockOptions, Deno.ServeHandler<Deno.VsockAddr>]
  | [Deno.ServeTcpOptions | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem), Deno.ServeHandler<Deno.NetAddr>]
  // [{ handler: (Request) => Response }]
  | [Deno.ServeUnixOptions & Deno.ServeInit<Deno.UnixAddr>]
  | [Deno.ServeVsockOptions & Deno.ServeInit<Deno.VsockAddr>]
  | [(Deno.ServeTcpOptions | (Deno.ServeTcpOptions & Deno.TlsCertifiedKeyPem)) & Deno.ServeInit<Deno.NetAddr>];

const isSimpleHandler = (p: ServeParams): p is [Deno.ServeHandler<Deno.Addr>] => typeof p[0] === 'function';

const isServeOptWithFunction = (p: ServeParams): p is [Deno.ServeOptions<Deno.Addr>, Deno.ServeHandler<Deno.Addr>] =>
  p.length >= 2 && typeof p[1] === 'function' && !!p[0] && typeof p[0] === 'object';

const isServeInitOptions = (p: ServeParams): p is [Deno.ServeOptions<Deno.Addr> & Deno.ServeInit<Deno.Addr>] =>
  typeof p[0] === 'object' &&
  !!p[0] &&
  !isServeOptWithFunction(p) &&
  'handler' in p[0] &&
  typeof p[0].handler === 'function';

const applyHandlerWrap = <A extends Deno.Addr>(
  handler: (request: Request, info: Deno.ServeHandlerInfo<A>) => Response | Promise<Response>,
  serveOptions?: Deno.ServeOptions,
): Deno.ServeHandler =>
  ((request, info) =>
    wrapDenoRequestHandler<A>(
      {
        request,
        info,
        serveOptions,
      } as RequestHandlerWrapperOptions<A>,
      () => handler(request, info as Deno.ServeHandlerInfo<A>),
    )) as Deno.ServeHandler;

const instrumentedDenoServe = (serve: typeof Deno.serve): typeof Deno.serve =>
  new Proxy(serve, {
    apply(target, thisArg, args: ServeParams) {
      if (isSimpleHandler(args)) {
        args[0] = applyHandlerWrap(args[0]);
      } else if (isServeOptWithFunction(args)) {
        args[1] = applyHandlerWrap(args[1], args[0]);
      } else if (isServeInitOptions(args)) {
        args[0].handler = applyHandlerWrap(args[0].handler, args[0]);
      }
      // if none of those matched, it'll crash, most likely.
      return target.apply(thisArg, args);
    },
  });

const _denoServeIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setAsyncLocalStorageAsyncContextStrategy();

      const originalServe = Deno.serve;
      const wrappedServe = instrumentedDenoServe(originalServe);

      try {
        const descriptor = Object.getOwnPropertyDescriptor(Deno, 'serve');

        Object.defineProperty(Deno, 'serve', {
          configurable: descriptor?.configurable ?? true,
          enumerable: descriptor?.enumerable ?? true,
          // writable: true avoids other instrumentations on older Deno versions
          // from crashing if they used to do assignment
          writable: true,
          value: wrappedServe,
        });
      } catch (error) {
        debug.warn('Could not instrument Deno.serve.', error);
      }
    },
  };
}) satisfies IntegrationFn;

export const denoServeIntegration = defineIntegration(_denoServeIntegration);
