import type { ClientOptions, Options, ServerRuntimeClientOptions } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_flushMetricsBuffer,
  applySdkMetadata,
  debug,
  ServerRuntimeClient,
  spanIsSampled,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { ExecutionContextCompat } from './executionContext';
import type { makeFlushLock } from './flush';
import type { CloudflareTransportOptions } from './transport';
import { getInvocationState, getInvocationWaitUntil } from './utils/invocationContext';

/**
 * The Sentry Cloudflare SDK Client.
 *
 * @see CloudflareClientOptions for documentation on configuration options.
 * @see ServerRuntimeClient for usage documentation.
 */
export class CloudflareClient extends ServerRuntimeClient {
  private readonly _flushLock: ReturnType<typeof makeFlushLock> | void;
  private _pendingSpans: Set<string> = new Set();
  private _spanCompletionPromise: Promise<void> | null = null;
  private _resolveSpanCompletion: (() => void) | null = null;

  private _unsubscribeSpanStart: (() => void) | null = null;
  private _unsubscribeSpanEnd: (() => void) | null = null;

  // True while a boundary `flush()` is draining; envelopes created by that drain ride it
  // and must not each start their own eager transport flush.
  private _inBoundaryFlush = false;

  /**
   * Whether this client is a cached, cross-invocation client (`cacheClient`).
   * Cached clients are never disposed at an invocation boundary, so their spans/events
   * are delivered eagerly instead of waiting for a per-invocation flush.
   */
  public readonly isCachedClient: boolean;

  /**
   * Creates a new Cloudflare SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: CloudflareClientOptions) {
    applySdkMetadata(options, 'cloudflare');
    options._metadata = options._metadata || {};
    const { flushLock, ...serverOptions } = options;

    const clientOptions: ServerRuntimeClientOptions = {
      ...serverOptions,
      platform: 'javascript',
      // TODO: Grab version information
      runtime: { name: 'cloudflare' },
      // TODO: Add server name
      _flushInterval: 0,
    };

    super(clientOptions);
    this._flushLock = flushLock;
    this.isCachedClient = options.cacheClient === true;

    // Track span lifecycle to know when to flush. Skipped for cached clients
    // (`cacheClient`): they are never disposed, so spans that end after
    // a flush are still delivered. Per-invocation clients are disposed right after
    // the boundary flush, so the flush must wait for open spans to end otherwise
    // their transaction never gets emitted.
    if (!this.isCachedClient) {
      this._unsubscribeSpanStart = this.on('spanStart', span => {
        const spanId = span.spanContext().spanId;
        DEBUG_BUILD && debug.log('[CloudflareClient] Span started:', spanId);

        // Negatively sampled spans never emit spanEnd,
        // so tracking them would cause _pendingSpans to grow unboundedly.
        // We should fix the inconsistent behavior for NonRecordingSpans in the future but
        // for now, we just ignore them.
        if (!spanIsSampled(span)) {
          return;
        }

        this._pendingSpans.add(spanId);

        if (!this._spanCompletionPromise) {
          this._spanCompletionPromise = new Promise(resolve => {
            this._resolveSpanCompletion = resolve;
          });
        }
      });

      this._unsubscribeSpanEnd = this.on('spanEnd', span => {
        const spanId = span.spanContext().spanId;
        DEBUG_BUILD && debug.log('[CloudflareClient] Span ended:', spanId);
        this._pendingSpans.delete(spanId);

        // If no more pending spans, resolve the completion promise
        if (this._pendingSpans.size === 0 && this._resolveSpanCompletion) {
          DEBUG_BUILD && debug.log('[CloudflareClient] All spans completed, preparing to flush');
          this._resolveSpanCompletion();
          this._resetSpanCompletionPromise();
        }
      });
    }
  }

  /**
   * Flushes pending operations and ensures all data is processed.
   * If a timeout is provided, the operation will be completed within the specified time limit.
   *
   * It will wait for all pending spans to complete before flushing.
   *
   * @param {number} [timeout] - Optional timeout in milliseconds to force the completion of the flush operation.
   * @return {Promise<boolean>} A promise that resolves to a boolean indicating whether the flush operation was successful.
   */
  public async flush(timeout?: number): Promise<boolean> {
    // Wait for user waitUntil-registered work to settle before draining, so events
    // captured in that work are still in the buffer. Without this the final flush
    // can drain (and the client be disposed) before background captures land.
    if (this._flushLock) {
      await this._flushLock.finalize();
    }

    if (this._pendingSpans.size > 0 && this._spanCompletionPromise) {
      DEBUG_BUILD &&
        debug.log('[CloudflareClient] Waiting for', this._pendingSpans.size, 'pending spans to complete...');

      const timeoutMs = timeout ?? 5000;
      const spanCompletionRace = Promise.race([
        this._spanCompletionPromise,
        new Promise(resolve =>
          setTimeout(() => {
            DEBUG_BUILD &&
              debug.log('[CloudflareClient] Span completion timeout after', timeoutMs, 'ms, flushing anyway');
            resolve(undefined);
          }, timeoutMs),
        ),
      ]);

      await spanCompletionRace;
    }

    // Envelopes created while this flush drains (log/metric/span buffers turning into
    // envelopes on the `flush` emit) ride its own transport drain; without the flag each
    // of them would also start an eager drain and a `waitUntil` registration.
    this._inBoundaryFlush = true;
    try {
      return await super.flush(timeout);
    } finally {
      this._inBoundaryFlush = false;
    }
  }

  /**
   * Disposes of the client and releases all resources.
   *
   * This method clears all Cloudflare-specific state in addition to the base client cleanup.
   * It unsubscribes from span lifecycle events and clears pending span tracking.
   *
   * Call this method after flushing to allow the client to be garbage collected.
   * After calling dispose(), the client should not be used anymore.
   */
  public override dispose(): void {
    DEBUG_BUILD && debug.log('[CloudflareClient] Disposing client...');

    super.dispose();

    if (this._unsubscribeSpanStart) {
      this._unsubscribeSpanStart();
      this._unsubscribeSpanStart = null;
    }
    if (this._unsubscribeSpanEnd) {
      this._unsubscribeSpanEnd();
      this._unsubscribeSpanEnd = null;
    }

    this._resetSpanCompletionPromise();
    (this as unknown as { _flushLock: ReturnType<typeof makeFlushLock> | void })._flushLock = undefined;
  }

  /** @inheritDoc */
  protected override _setupIntegrations(): void {
    // Clear AI provider skip registrations before setting up integrations.
    // The registry is module-global and Cloudflare calls `init()` per request, so without this a
    // single `ai` SDK call would suppress direct `env.AI.run` spans for the rest of the isolate's
    // life. Mirrors the same reset in the Node client.
    _INTERNAL_clearAiProviderSkips();
    super._setupIntegrations();

    // Registered after the integrations on purpose: the flush-point marker must run
    // after core and the span buffer have turned their buffers into envelopes on the
    // same `flush` emit (so those envelopes ride the boundary drain instead of starting
    // eager ones), and the eager span handler relies on `spanStreamingIntegration`
    // having already buffered the span that triggers it.
    if (this.isCachedClient) {
      // Marks the invocation's natural flush point: anything captured from now on
      // (post-response `waitUntil` work, detached continuations) has no later flush
      // to ride and is delivered eagerly by the hooks below.
      this.on('flush', () => {
        const invocationState = getInvocationState();
        if (invocationState) {
          invocationState.flushPointReached = true;
        }
      });
      this._setupEagerEnvelopeDelivery();
      this._setupEagerBufferDelivery();
    }
  }

  /**
   * Resets the span completion promise and resolve function.
   */
  private _resetSpanCompletionPromise(): void {
    this._pendingSpans.clear();
    this._spanCompletionPromise = null;
    this._resolveSpanCompletion = null;
  }

  /**
   * Drains the transport after an envelope has been accepted past the invocation's
   * flush point. The transport queues request producers until `flush()`; before the
   * flush point the boundary `flush()` drains everything, but envelopes created after
   * it (post-response `waitUntil` work, detached continuations) have no later flush to
   * ride. The drain is registered with the invocation's `waitUntil` to keep the fetch
   * alive; outside any instrumented invocation it always runs.
   */
  private _setupEagerEnvelopeDelivery(): void {
    this.on('afterEnvelope', () => {
      const transport = this.getTransport();
      const invocationState = getInvocationState();

      if (!transport || this._inBoundaryFlush || (invocationState && !invocationState.flushPointReached)) {
        return;
      }

      this._registerWithInvocationWaitUntil(transport.flush(2000));
    });
  }

  /**
   * Turns spans, logs and metrics captured past the invocation's flush point into
   * envelopes. Before the flush point the boundary `flush()` drains their buffers; after
   * it (or outside any instrumented invocation) nothing else would: the log/metric idle
   * timer is disabled for this runtime (`_flushInterval: 0`) and the span buffer's own 5s
   * timer fires outside any invocation, where the runtime suspends the send. Each capture
   * drains only its own bucket (the ended span's trace, the log buffer, the metric
   * buffer), so a fan-out of concurrent traces stays one envelope per trace. RPC method
   * spans never reach this path: `wrapMethodWithSentry` runs the boundary flush after the
   * method span has ended, so only work past that (e.g. detached continuations) lands here.
   */
  private _setupEagerBufferDelivery(): void {
    this.on('afterSpanEnd', span => {
      // The trace id must come from the span, not the current scope: `continueTrace`
      // writes the propagation context to the *current* scope, so the forked
      // isolation scope's propagation context carries a different trace id and
      // flushing by it silently no-ops.
      const traceId = span.spanContext().traceId;
      this._eagerDrain(() => this.emit('flushTraceSpans', traceId));
    });
    this.on('afterCaptureLog', () => this._eagerDrain(() => _INTERNAL_flushLogsBuffer(this)));
    this.on('afterCaptureMetric', () => this._eagerDrain(() => _INTERNAL_flushMetricsBuffer(this)));
  }

  /**
   * Runs `drain` unless the owning invocation has not reached its flush point yet
   * (before it the boundary `flush()` delivers the buffers).
   */
  private _eagerDrain(drain: () => void): void {
    const invocationState = getInvocationState();

    if (invocationState && !invocationState.flushPointReached) {
      return;
    }

    drain();
  }

  /**
   * Attaches a promise to the `waitUntil` of the invocation that owns the current
   * async context, so the runtime keeps the send alive after the response is returned.
   * Outside any instrumented invocation (or where the context has no `waitUntil`,
   * e.g. Astro prerendering) the send is fire-and-forget.
   */
  private _registerWithInvocationWaitUntil(promise: PromiseLike<unknown>): void {
    const invocationState = getInvocationState();
    const waitUntil = invocationState && getInvocationWaitUntil(invocationState);
    if (!waitUntil) {
      return;
    }

    try {
      waitUntil(
        Promise.resolve(promise).then(
          () => undefined,
          () => undefined,
        ),
      );
    } catch {
      // The owning invocation already ended; the send races isolate teardown either way.
    }
  }
}

interface BaseCloudflareOptions {
  /**
   * @ignore Used internally to disable the deDupeIntegration for workflows.
   * @hidden Used internally to disable the deDupeIntegration for workflows.
   * @default true
   */
  enableDedupe?: boolean;

  /**
   * The Cloudflare SDK is not OpenTelemetry native. By default (`false`) it does not set up a tracer
   * provider; spans are emitted via the SDK's own instrumentation and scopes are isolated with
   * AsyncLocalStorage.
   *
   * Set this to `true` to opt into the OpenTelemetry compatibility tracer, which captures spans
   * emitted via `@opentelemetry/api`. Big caveat: it does not handle custom context, always working
   * off the current scope. This is good enough for many, but not all, integrations.
   *
   * @default false
   */
  enableOpenTelemetrySetup?: boolean;

  /**
   * The bindings on `env` that outgoing RPC calls propagate trace context to.
   *
   * Strings match a binding name exactly, regular expressions match by pattern. An empty array
   * (the default) propagates to nothing.
   *
   * RPC has no headers to carry trace context, so the SDK appends it as a trailing argument to
   * every RPC method call on a matching binding. Only a Sentry-instrumented receiver strips that
   * argument again. Anywhere else it arrives as a real argument and changes what the method was
   * called with, so list only the bindings whose receiver you know runs Sentry.
   *
   * Propagation over `stub.fetch()` and service binding `fetch()` uses HTTP headers and is not
   * affected by this option.
   *
   * When you build with the Sentry Cloudflare Vite plugin, bindings that resolve to *this* worker
   * (its own Durable Objects, its self service bindings) are added for you, because the plugin
   * instruments those receivers itself. Whatever you list here is added on top of them.
   *
   * @default []
   * @example
   * ```ts
   * // Propagate to `env.ORDERS` and every `env.SVC_*` binding
   * export default Sentry.withSentry(
   *   env => ({
   *     dsn: env.SENTRY_DSN,
   *     rpcTracePropagationTargets: ['ORDERS', /^SVC_/],
   *   }),
   *   handler,
   * );
   * ```
   */
  rpcTracePropagationTargets?: Array<string | RegExp>;

  /**
   * Table names that should stay instrumented even though they match the reserved `cf_` prefix used
   * by Durable Object frameworks (`agents`, `partyserver`, ...) for their internal SQLite tables.
   *
   * By default, `exec` queries against `cf_`-prefixed tables are treated as framework noise and no
   * `db.query` span is created for them. If one of your own tables happens to use this prefix, add it
   * here to opt it back into instrumentation. Entries are matched against each table name in the
   * query summary — strings must match exactly, while regular expressions give you prefix/pattern
   * matching.
   *
   * @default []
   * @example
   * ```ts
   * export default Sentry.withSentry(
   *   (env) => ({
   *     dsn: env.SENTRY_DSN,
   *     durableObjectSqlSpanAllowlist: ['cf_my_table', /^cf_reports_/],
   *   }),
   *   handler,
   * );
   * ```
   */
  durableObjectSqlSpanAllowlist?: Array<string | RegExp>;

  /**
   * KV keys that should stay instrumented even though they match a reserved prefix used by Durable
   * Object frameworks (`agents`, `partyserver`, ...) for their internal storage entries.
   *
   * By default, KV reads/writes (`get`, `put`, `delete`, `list`) of `cf_`- or `__ps_`-prefixed keys
   * are treated as framework noise and no `durable_object_storage_*` span is created for them,
   * mirroring how `cf_`-prefixed SQL tables are handled (see {@link durableObjectSqlSpanAllowlist}).
   * If one of your own keys happens to use such a prefix, add it here to opt it back into
   * instrumentation. Strings must match exactly, while regular expressions give you prefix/pattern
   * matching.
   *
   * @default []
   * @example
   * ```ts
   * export default Sentry.withSentry(
   *   (env) => ({
   *     dsn: env.SENTRY_DSN,
   *     durableObjectStorageSpanAllowlist: ['cf_my_key', /^cf_reports_/],
   *   }),
   *   handler,
   * );
   * ```
   */
  durableObjectStorageSpanAllowlist?: Array<string | RegExp>;

  /**
   * Sets an optional server name (device name).
   *
   * This is useful for identifying which server or instance is sending events.
   */
  serverName?: string;

  /**
   * If you use Spotlight by Sentry during development, use
   * this option to forward captured Sentry events to Spotlight.
   *
   * Either set it to true, or provide a specific Spotlight Sidecar URL.
   *
   * More details: https://spotlightjs.com/
   *
   * IMPORTANT: Only set this option to `true` while developing, not in production!
   */
  spotlight?: boolean | string;

  /**
   * Cache the client and reuse it across invocations within the same isolate.
   *
   * The SDK creates one client per isolate and reuses it for all requests/DO
   * handlers in that isolate. This avoids the per-invocation cost of
   * constructing a new client.
   *
   * Since a cached client outlives any single invocation, data captured after an
   * invocation's flush point (post-response `waitUntil` work, detached background
   * work) is delivered eagerly instead of waiting for a flush that never comes.
   *
   * The first `init()` in an isolate decides the cached client's options; later
   * `init()` calls with different options (e.g. another DSN) reuse the cached client
   * unchanged (a debug warning is logged for a DSN change). Use `cacheClient: false`
   * when options must differ per invocation.
   *
   * When disabled, a new client is created per invocation and disposed after the
   * handler completes.
   *
   * @default true
   */
  cacheClient?: boolean;
}

/**
 * Configuration options for the Sentry Cloudflare SDK
 *
 * @see @sentry/core Options for more information.
 */
export interface CloudflareOptions extends Options<CloudflareTransportOptions>, BaseCloudflareOptions {
  ctx?: ExecutionContextCompat;
}

/**
 * Configuration options for the Sentry Cloudflare SDK Client class
 *
 * @see CloudflareClient for more information.
 */
export interface CloudflareClientOptions extends ClientOptions<CloudflareTransportOptions>, BaseCloudflareOptions {
  flushLock?: ReturnType<typeof makeFlushLock>;
}
