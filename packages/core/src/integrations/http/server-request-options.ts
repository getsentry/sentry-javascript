import type { Span } from '../../types/span';
import type { MaxRequestBodySize } from '../../utils/request';

/**
 * Options that every integration for incoming HTTP requests should
 * support, in each runtime.
 *
 * `TRequest` and `TResponse` are the request and response types that the
 * runtime passes to callbacks: `HttpIncomingMessage` and
 * `HttpServerResponse` for `node:http`, or the web `Request` and
 * `Response` for `Deno.serve`, `Bun.serve` and Cloudflare.
 *
 * Runtime options types do not extend this type. Each one declares its
 * own fields, with docs for that runtime, and uses
 * {@link CheckServerRequestOptions} to check them against this type.
 * Then a new field here fails to compile in each runtime, until the
 * runtime supports it or lists it as unsupported.
 */
export interface ServerRequestOptions<TRequest, TResponse> {
  /**
   * Whether to create spans for incoming requests.
   * Defaults to the client's tracing configuration.
   */
  spans?: boolean;

  /**
   * Whether to create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming
   * requests, to track the health and crash-free rate of releases.
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
   * Controls the maximum size of incoming request bodies attached to events.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: MaxRequestBodySize;

  /**
   * Do not capture the request body for incoming requests where the given callback returns `true`.
   *
   * `url` is the full URL of the request, including the query string.
   */
  ignoreRequestBody?: (url: string, request: TRequest) => boolean;

  /**
   * Do not create spans for incoming requests where the given callback returns `true`.
   *
   * `urlPath` is the path of the request, including the query string.
   */
  ignoreIncomingRequests?: (urlPath: string, request: TRequest) => boolean;

  /**
   * Whether to ignore common static asset requests (favicon.ico, robots.txt, etc.)
   * when creating spans.
   *
   * @default `true`
   */
  ignoreStaticAssets?: boolean;

  /**
   * A hook to change the span for an incoming request, after the span is created.
   */
  onSpanCreated?: (span: Span, request: TRequest) => void;

  /**
   * A hook to change the span for an incoming request one last time, before it ends.
   */
  onSpanEnd?: (span: Span, request: TRequest, response: TResponse) => void;
}

/**
 * `true` when `TOptions` matches {@link ServerRequestOptions}, else a
 * string that names the problem. Use it with a type that accepts only
 * `true`, so a mismatch fails to compile:
 *
 * ```ts
 * type _Check = AssertTrue<CheckServerRequestOptions<MyOptions, Request, Response, 'sessions'>>;
 * ```
 *
 * `TUnsupported` lists the fields that the runtime does not support.
 *
 * The check fails when:
 * - `TOptions` does not declare a field, and `TUnsupported` does not
 *   list it.
 * - `TUnsupported` lists a field that `TOptions` declares.
 * - A callback written for the shared type does not fit the field in
 *   `TOptions`.
 */
export type CheckServerRequestOptions<
  TOptions,
  TRequest,
  TResponse,
  TUnsupported extends keyof ServerRequestOptions<TRequest, TResponse> = never,
> = [MissingFields<TOptions, TRequest, TResponse, TUnsupported>] extends [never]
  ? [Extract<TUnsupported, keyof TOptions>] extends [never]
    ? SupportedFields<
        ServerRequestOptions<TRequest, TResponse>,
        TRequest,
        TResponse,
        TUnsupported
      > extends SupportedFields<TOptions, TRequest, TResponse, TUnsupported>
      ? true
      : 'A field type does not match ServerRequestOptions'
    : `Listed as unsupported, but declared: ${Extract<TUnsupported, keyof TOptions> & string}`
  : `Missing field: ${MissingFields<TOptions, TRequest, TResponse, TUnsupported> & string}`;

type MissingFields<TOptions, TRequest, TResponse, TUnsupported> = Exclude<
  keyof ServerRequestOptions<TRequest, TResponse>,
  TUnsupported | keyof TOptions
>;

type SupportedFields<T, TRequest, TResponse, TUnsupported> = Pick<
  T,
  Extract<keyof T, Exclude<keyof ServerRequestOptions<TRequest, TResponse>, TUnsupported>>
>;

/** Accepts only `true`. Use it with {@link CheckServerRequestOptions}. */
export type AssertTrue<T extends true> = T;
