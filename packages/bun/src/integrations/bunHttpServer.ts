import { errorMonitor } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import type { HttpIncomingMessage, HttpServerResponse, IntegrationFn, Span } from '@sentry/core';
import { defineIntegration, getHttpServerSubscriptions, HTTP_ON_SERVER_REQUEST } from '@sentry/core';

const INTEGRATION_NAME = 'BunHttpServer' as const;

interface BunHttpServerOptions {
  /**
   * Whether to create `http.server` spans for incoming requests.
   *
   * Set this to `false` when another layer already emits incoming-request spans
   * (e.g. Next.js running on Bun, which creates its own OpenTelemetry spans).
   * The integration then only isolates each request and resets its trace, without
   * creating duplicate transactions.
   *
   * @default true
   */
  spans?: boolean;

  /**
   * Whether the integration should create [Sessions](https://docs.sentry.io/product/releases/health/#sessions) for incoming requests.
   *
   * @default true
   */
  sessions?: boolean;

  /**
   * Number of milliseconds until sessions are flushed as a session aggregate.
   *
   * @default 60000
   */
  sessionFlushingDelayMS?: number;

  /**
   * Do not capture the request body for incoming HTTP requests to URLs where the given callback returns `true`.
   */
  ignoreRequestBody?: (url: string, request: http.RequestOptions) => boolean;

  /**
   * Controls the maximum size of incoming HTTP request bodies attached to events.
   *
   * @default 'medium'
   */
  maxRequestBodySize?: 'none' | 'small' | 'medium' | 'always';

  /**
   * Do not capture spans for incoming HTTP requests to URLs where the given callback returns `true`.
   *
   * The `urlPath` param consists of the URL path and query string (if any) of the incoming request.
   */
  ignoreIncomingRequests?: (urlPath: string, request: HttpIncomingMessage) => boolean;

  /**
   * Whether to automatically ignore common static asset requests like favicon.ico, robots.txt, etc.
   *
   * @default true
   */
  ignoreStaticAssets?: boolean;

  /**
   * A hook that can be used to mutate the span for incoming requests.
   * This is triggered after the span is created, but before it is recorded.
   */
  onSpanCreated?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;

  /**
   * A hook that can be used to mutate the span one last time when the response is finished.
   */
  onSpanEnd?: (span: Span, request: HttpIncomingMessage, response: HttpServerResponse) => void;
}

let hasPatched = false;

const _bunHttpServerIntegration = ((options: BunHttpServerOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentBunHttpServer(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Instruments incoming `node:http`/`node:https` server requests under the Bun runtime.
 *
 * Unlike Node.js, Bun does not emit the `http.server.request.start` diagnostics channel that the
 * Node SDK relies on to isolate each incoming request. As a result, servers built on `node:http`
 * (such as Next.js running via `bun --bun`) do not get a fresh isolation scope and trace per request,
 * so unrelated requests can end up sharing one trace.
 *
 * This closes that gap by patching `http.Server.prototype.emit` and, on the first `'request'` event
 * of each server, handing that server to the same core instrumentation the Node SDK uses
 * (`getHttpServerSubscriptions` → `instrumentServer`). We patch the prototype (not `createServer`)
 * because the server is typically created before Sentry is initialized — e.g. Next.js creates and
 * `listen()`s its server before running the `instrumentation.ts` `register()` hook that loads the
 * Sentry config.
 *
 * This is intended for `node:http`-based servers. For `Bun.serve`, use {@link bunServerIntegration}.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.bunHttpServerIntegration(),
 *   ],
 * })
 * ```
 */
export const bunHttpServerIntegration = defineIntegration(_bunHttpServerIntegration);

/**
 * Patches `http.Server.prototype.emit` so each server's incoming requests are isolated using the
 * same core instrumentation the Node SDK uses.
 *
 * Only exported for tests.
 */
export function instrumentBunHttpServer(options: BunHttpServerOptions = {}): void {
  // This only makes sense under Bun; on Node the diagnostics channel already handles this.
  if (!process.versions.bun || hasPatched) {
    return;
  }

  const { [HTTP_ON_SERVER_REQUEST]: onServerRequest } = getHttpServerSubscriptions({
    ...options,
    // Pass the real `errorMonitor` symbol so core observes `'error'` events without consuming
    // them — otherwise it would swallow errors before they reach user-supplied `'error'` handlers.
    errorMonitor,
  });

  // Track which servers we have already handed to core, so we instrument each server exactly once.
  // After core instruments a server it installs its own `emit` on the instance, which shadows this
  // prototype patch for all subsequent requests to that server.
  const instrumented = new WeakSet<object>();

  const patchEmitOn = (ServerClass: typeof http.Server): void => {
    // oxlint-disable-next-line typescript/unbound-method
    const originalEmit = ServerClass.prototype.emit;
    ServerClass.prototype.emit = function (this: http.Server, event: string, ...args: unknown[]): boolean {
      if (event === 'request' && !instrumented.has(this)) {
        instrumented.add(this);
        // Hand the server to core, which patches this instance's `emit` to isolate requests.
        onServerRequest({ server: this }, HTTP_ON_SERVER_REQUEST);
        // Re-dispatch the in-flight request through the instance emit core just installed.
        return this.emit(event, ...args);
      }
      return originalEmit.call(this, event, ...args) as boolean;
    } as typeof originalEmit;
  };

  patchEmitOn(http.Server);
  // In Bun `https.Server` reuses `http.Server`, but patch it explicitly in case that ever diverges.
  if (https.Server !== http.Server) {
    patchEmitOn(https.Server);
  }

  hasPatched = true;
}
