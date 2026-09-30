/**
 * Vendored subset of the `nitro`/`h3`/`srvx`/`unstorage` tracing types used by the Sentry Nitro
 * instrumentation.
 *
 * The instrumentation lives in `@sentry/server-utils`, a dependency of every server SDK — including
 * apps that do not use Nitro. We therefore declare no dependency on those packages at all: the
 * instrumentation only ever subscribes to `node:diagnostics_channel` channels, so these minimal
 * structural types stand in for the real `nitro/h3`, `h3/tracing`, `srvx/tracing` and
 * `unstorage/tracing` types at the boundary.
 *
 * ATTENTION: keep these permissive — the payloads are produced by the frameworks, so these types
 * must stay assignable from the real ones. Only the fields the instrumentation reads are declared.
 */

/** Minimal shape of an `h3` event, as read from the `h3.request` tracing channel. */
export interface NitroH3Event {
  url: { href: string };
  req: { method?: string };
  res?: { headers: { append: (name: string, value: string) => void } };
  context?: {
    matchedRoute?: { route?: string };
    params?: unknown;
    /** Set by the Server-Timing instrumentation so trace headers are only appended once per request. */
    _sentryServerTimingSet?: boolean;
  };
}

/** Payload of the `h3.request` tracing channel (`h3/tracing`'s `TracingRequestEvent`). */
export interface H3TracingRequestEvent {
  type: 'middleware' | 'route';
  event: NitroH3Event;
}

/** Payload of the `srvx.request`/`srvx.middleware` tracing channels (`srvx/tracing`'s `RequestEvent`). */
export interface SrvxRequestEvent {
  server: { options: { port?: number } };
  request: {
    _url?: { href: string; pathname: string };
    method: string;
    headers: Headers;
  };
  middleware?: {
    index: number;
    handler: { name?: string };
  };
}

/** Payload of the `unstorage.*` tracing channels (`unstorage/tracing`'s `TraceContext`). */
export interface UnstorageTraceContext {
  keys?: string[];
  base?: string;
  driver?: { name?: string };
}
