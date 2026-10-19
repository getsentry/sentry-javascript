import type { Event, IntegrationFn, MaxRequestBodySize, Span } from '@sentry/core';
import { debug, defineIntegration } from '@sentry/core';
import { DEFAULT_IGNORE_STATUS_CODES, processHttpServerTransactionEvent } from '@sentry/core/server';
import type { RequestHandlerWrapperOptions } from '../wrap-deno-request-handler';
import { wrapDenoRequestHandler } from '../wrap-deno-request-handler';

const INTEGRATION_NAME = 'DenoServe' as const;

export type DenoServeIntegrationOptions = {
  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   * An explicit value overrides `dataCollection.httpBodies`.
   *
   * If `dataCollection.httpBodies` excludes `'incomingRequest'`, body capture defaults to `'none'`.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: MaxRequestBodySize;

  /**
   * Do not capture the request body for incoming requests where the given callback returns `true`.
   *
   * `url` is the full URL of the request, including the query string. `request` is the incoming
   * {@link Request}. The callback runs before the SDK reads the body.
   */
  ignoreRequestBody?: (url: string, request: Request) => boolean;

  /**
   * Do not capture server spans for incoming requests whose URL path makes the given callback return `true`.
   *
   * `urlPath` is the path of the request, including the query string. `request` is the incoming
   * {@link Request}. Errors thrown by the handler are still captured.
   */
  ignoreIncomingRequests?: (urlPath: string, request: Request) => boolean;

  /**
   * Whether to automatically ignore common static asset requests (favicon.ico, robots.txt, etc.)
   * when creating server spans.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * Whether to create spans for incoming requests.
   * Errors are still captured and request data is still attached when this is `false`.
   * Defaults to the client's tracing configuration (`hasSpansEnabled`).
   */
  spans?: boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, before the request handler runs.
   */
  onSpanCreated?: (span: Span, request: Request) => void;

  /**
   * A hook that can be used to mutate the span one last time before it ends.
   * For a streamed response, this runs when the stream finishes.
   * It is not called when the request handler throws.
   */
  onSpanEnd?: (span: Span, request: Request, response: Response) => void;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for
   * incoming requests to track the health and crash-free rate of your releases in Sentry.
   *
   * For a streamed response, the session ends when the stream finishes.
   *
   * @default `true`
   */
  sessions?: boolean;

  /**
   * Number of milliseconds until sessions are flushed as a session aggregate.
   *
   * @default `60000` (60s)
   */
  sessionFlushingDelayMS?: number;

  /**
   * Do not capture spans for incoming `Deno.serve` requests with the given status codes.
   * By default, some 3xx and 4xx status codes are dropped (see @default).
   * Expects an array of status codes or a range of status codes, e.g. [[300,399], 404] would ignore 3xx and 404 status codes.
   *
   * Applies only to spans this integration creates. `node:http` requests are covered by
   * `denoHttpIntegration`'s own option of the same name. Pass `[]` to keep everything.
   *
   * Only takes effect with `traceLifecycle: 'static'`. The default `'stream'` lifecycle does not
   * produce transaction events, so the filter does not run.
   *
   * @default `[[401, 404], [301, 303], [305, 399]]`
   *
   * @deprecated This option only has an effect if `traceLifecycle` is set to `'static'`. With span streaming
   * (`traceLifecycle: 'stream'`, the default), the SDK ignores it: child spans are sent as they end, before the
   * response status code is known, so a request's spans cannot be dropped retroactively. `ignoreStatusCodes` will be
   * removed in v12 of the SDK.
   */
  ignoreStatusCodes?: (number | [number, number])[];
};

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

const applyHandlerWrap =
  <A extends Deno.Addr>(
    handler: (request: Request, info: Deno.ServeHandlerInfo<A>) => Response | Promise<Response>,
    serveOptions?: Deno.ServeOptions,
  ): Deno.ServeHandler =>
  (request, info) =>
    wrapDenoRequestHandler<A>(
      {
        request,
        info,
        serveOptions,
      } as RequestHandlerWrapperOptions<A>,
      () => handler(request, info as Deno.ServeHandlerInfo<A>),
    );

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

const _denoServeIntegration = ((options: DenoServeIntegrationOptions = {}) => {
  // oxlint-disable-next-line typescript/no-deprecated
  const ignoreStatusCodes = options.ignoreStatusCodes ?? DEFAULT_IGNORE_STATUS_CODES;

  return {
    name: INTEGRATION_NAME,
    maxRequestBodySize: options.maxRequestBodySize,
    ignoreRequestBody: options.ignoreRequestBody,
    ignoreIncomingRequests: options.ignoreIncomingRequests,
    ignoreStaticAssets: options.ignoreStaticAssets ?? true,
    spans: options.spans,
    onSpanCreated: options.onSpanCreated,
    onSpanEnd: options.onSpanEnd,
    sessions: options.sessions ?? true,
    sessionFlushingDelayMS: options.sessionFlushingDelayMS,
    processEvent(event: Event): Event | null {
      // Gated on this integration's own span origin so it does not filter `node:http`
      // transactions, which `denoHttpIntegration` owns via its own `ignoreStatusCodes`.
      return processHttpServerTransactionEvent(event, ignoreStatusCodes, 'auto.http.deno');
    },
    setupOnce() {
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
