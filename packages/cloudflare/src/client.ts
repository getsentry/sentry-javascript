import type { Client, ClientOptions, Options, ServerRuntimeClientOptions } from '@sentry/core';
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
import { getOriginalWaitUntil } from './flush';
import type { CloudflareTransportOptions } from './transport';
import { getInvocationState } from './utils/invocationContext';

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

  private _invocationContext: ExecutionContextCompat | undefined;

  /**
   * Whether this client is a cached, cross-invocation client (`cacheClient`).
   * Cached clients are never disposed at an invocation boundary, so their spans/events
   * are delivered eagerly instead of waiting for a per-invocation flush.
   */
  public readonly isCachedClient: boolean;

  /**
   * Points the client at the execution context of the invocation currently being
   * served. Called on every invocation for cached clients, since they outlive any
   * single invocation. Only a fallback: under concurrency the correct context is
   * resolved from the invocation's async context instead (see
   * `getInvocationState`), which this field cannot disambiguate.
   */
  public setExecutionContext(ctx: ExecutionContextCompat | undefined): void {
    this._invocationContext = ctx;
  }

  /**
   * Creates a new Cloudflare SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: CloudflareClientOptions) {
    applySdkMetadata(options, 'cloudflare');
    options._metadata = options._metadata || {};
    const { flushLock, invocationContext, ...serverOptions } = options;

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
    this._invocationContext = invocationContext;
    this.isCachedClient = options.cacheClient === true;

    if (this.isCachedClient) {
      this._setupEagerEnvelopeDelivery();
      this._setupEagerSpanDelivery();
      this._setupEagerLogAndMetricDelivery();
    }

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
          DEBUG_BUILD && debug.log('[CloudflareClient] All spans completed, resolving promise');
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
    // Mark this invocation as past its natural flush point: anything captured from
    // now on (post-response waitUntil work, detached continuations) has no later
    // flush to ride, so it is delivered eagerly (see _setupEagerSpanDelivery).
    const invocationState = getInvocationState();
    if (invocationState) {
      invocationState.flushPointReached = true;
    }

    // Wait for user waitUntil-registered work to settle before draining, so events
    // captured in that work are still in the buffer. Without this the final flush
    // can drain (and the client be disposed) before background captures land.
    if (this._flushLock) {
      await this._flushLock.finalize();
    }

    // The eager log/metric drain is debounced to a microtask, so captured logs and
    // metrics may not be envelopes yet. Draining only the transport would resolve
    // while they are still buffer entries — and a resolving boundary flush lets the
    // invocation end before their envelopes are ever created.
    if (this.isCachedClient) {
      _INTERNAL_flushLogsBuffer(this);
      _INTERNAL_flushMetricsBuffer(this);
    }

    // Await only drains owned by this invocation. Concurrent invocations keep
    // independent chains on their own isolation scopes.
    if (invocationState?.eagerFlushPromise) {
      await invocationState.eagerFlushPromise;
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

    return super.flush(timeout);
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
   * Drains the transport after an envelope has been accepted.
   *
   * The Cloudflare transport queues request producers until `flush()` is called. Cached
   * clients cannot rely on a later invocation boundary, so each accepted envelope starts
   * an eager drain. Drains are serialized per invocation and registered with that
   * invocation's `waitUntil`, ensuring the runtime keeps their fetches alive after the
   * response is returned.
   */
  private _setupEagerEnvelopeDelivery(): void {
    this.on('afterEnvelope', () => {
      const transport = this.getTransport();
      if (!transport) {
        return;
      }
      const invocationState = getInvocationState();
      const flushTransport = (): PromiseLike<boolean> => transport.flush(2000);
      const flushPromise = invocationState?.eagerFlushPromise
        ? Promise.resolve(invocationState.eagerFlushPromise).then(flushTransport, flushTransport)
        : flushTransport();

      if (invocationState) {
        invocationState.eagerFlushPromise = flushPromise;
        void Promise.resolve(flushPromise).finally(() => {
          if (invocationState.eagerFlushPromise === flushPromise) {
            invocationState.eagerFlushPromise = undefined;
          }
        });
      }

      this._registerWithInvocationWaitUntil(flushPromise);
    });
  }

  /**
   * Delivers spans that end after the invocation's flush point.
   *
   * Spans ending while the invocation is in flight batch in the span buffer and
   * are drained by the boundary `flush()` — nothing to do here. Spans ending
   * after it (in `waitUntil` work or detached continuations) have no later
   * natural flush point, and the buffer's own 5s flush timer would fire outside
   * any invocation, where the send can only be registered with a stale execution
   * context (or none), and the runtime suspends it. Those traces are flushed
   * directly — only their own bucket, never the whole buffer, so a fan-out of
   * concurrent traces stays one envelope per trace.
   *
   * The flush point is per invocation. In Durable Objects it lands at RPC-method
   * settle, so RPC spans (which end before it) keep batching one envelope per
   * trace — flushing them per call would turn a fan-out trace into one envelope
   * per RPC — while detached continuations inheriting that invocation's state
   * flush eagerly.
   */
  private _setupEagerSpanDelivery(): void {
    this.on('afterSpanEnd', span => {
      const invocationState = getInvocationState();
      // Only deliver spans that end after the invocation's flush point — spans
      // ending before it batch in the buffer and are drained by the boundary
      // flush. RPC sub-invocations in Durable Objects never reach a flush point,
      // so their spans batch one envelope per trace here.
      if (!invocationState?.flushPointReached) {
        return;
      }
      const pendingTraceIds = (invocationState.pendingSpanFlushTraceIds ??= new Set<string>());
      if (pendingTraceIds.has(span.spanContext().traceId)) {
        return;
      }
      pendingTraceIds.add(span.spanContext().traceId);
      // The trace id must come from the span, not the current scope: `continueTrace`
      // writes the propagation context to the *current* scope, so the forked
      // isolation scope's propagation context carries a different trace id and
      // flushing by it silently no-ops.
      const traceId = span.spanContext().traceId;
      // Defer to a microtask: a synchronous flush here runs before the span
      // streaming integration's own `afterSpanEnd` handler has added the
      // triggering span to the buffer (it is registered after this one), so the
      // tail span of the invocation would be left behind. The microtask still
      // runs in the same async context, so the send stays attributed to this
      // invocation.
      queueMicrotask(() => {
        pendingTraceIds.delete(traceId);
        this.emit('flushTraceSpans', traceId);
      });
    });
  }

  /**
   * Turns log and metric captures into envelopes without waiting for a flush.
   *
   * Unlike events, logs and metrics batch client-side and only become an envelope when
   * their buffer is drained. The idle drain timer is disabled for this runtime
   * (`_flushInterval: 0`), and a cached client never reaches an invocation-boundary
   * `flush()`, so without this a captured log or metric is never delivered at all.
   *
   * The buffers are drained directly rather than via `emit('flush')`, which would also
   * flush an opt-in span buffer mid-invocation and fragment span segments. Draining is
   * debounced to a microtask so a synchronous burst (e.g. a loop of `logger` calls)
   * still produces a single envelope.
   */
  private _setupEagerLogAndMetricDelivery(): void {
    let scheduled = false;
    const scheduleDrain = (): void => {
      if (scheduled) {
        return;
      }
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        _INTERNAL_flushLogsBuffer(this);
        _INTERNAL_flushMetricsBuffer(this);
      });
    };

    this.on('afterCaptureLog', scheduleDrain);
    this.on('afterCaptureMetric', scheduleDrain);
  }

  /**
   * Registers every envelope send as tracked I/O with the capturing invocation's
   * `waitUntil`.
   *
   * The SDK never awaits `sendEnvelope()` promises, so an envelope's fetch can be
   * pending-but-untracked when the invocation's tracked work settles the runtime
   * suspends it and the envelope is lost even though the send started while the
   * invocation was still open. This is the dominant loss path for the last captures
   * of an invocation (the root span, post-response `waitUntil` work).
   */
  public override sendEnvelope(envelope: Parameters<Client['sendEnvelope']>[0]): ReturnType<Client['sendEnvelope']> {
    const sendPromise = super.sendEnvelope(envelope);
    if (this.isCachedClient) {
      this._registerWithInvocationWaitUntil(sendPromise);
    }
    return sendPromise;
  }

  /**
   * Attaches a promise to the `waitUntil` of the invocation that owns the current
   * async context. The invocation state identifies that invocation even under
   * concurrency the fallback field would point at whichever invocation last
   * called `init()`, which is the wrong one when invocations overlap. In Durable
   * Objects `waitUntil` is a no-op, so this degrades to the same fire-and-forget
   * behavior as before there.
   */
  private _registerWithInvocationWaitUntil(promise: PromiseLike<unknown>): void {
    const ctx = getInvocationState()?.ctx ?? this._invocationContext;

    if (!ctx) {
      return;
    }

    try {
      getOriginalWaitUntil(ctx)?.call(
        ctx,
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
   * Enable trace propagation for RPC calls between Workers, Durable Objects, and Service Bindings.
   *
   * When enabled, trace context (sentry-trace + baggage) is propagated across:
   * - `stub.fetch()` calls to Durable Objects (via HTTP headers)
   * - Service binding `fetch()` calls (via HTTP headers)
   * - RPC method calls to Durable Objects and WorkerEntrypoints (via trailing argument)
   *
   * When enabled on the **receiver side** (DurableObject or WorkerEntrypoint), the SDK will also:
   * - Extract and continue traces from incoming RPC calls
   * - Create spans for each RPC method invocation
   * - Capture errors thrown by RPC methods
   *
   * **Important:** This option should be enabled on **both sides** for full trace propagation.
   *
   * @default false
   * @example
   * ```ts
   * // Worker side (caller)
   * export default Sentry.withSentry(
   *   (env) => ({
   *     dsn: env.SENTRY_DSN,
   *     enableRpcTracePropagation: true,
   *   }),
   *   handler,
   * );
   *
   * // Durable Object side (receiver)
   * export const MyDO = Sentry.instrumentDurableObjectWithSentry(
   *   (env) => ({
   *     dsn: env.SENTRY_DSN,
   *     enableRpcTracePropagation: true,
   *   }),
   *   MyDOBase,
   * );
   *
   * // WorkerEntrypoint side (receiver)
   * export const MyEntrypoint = Sentry.withSentry(
   *   env => ({ dsn: env.SENTRY_DSN, enableRpcTracePropagation: true }),
   *   MyEntrypointBase,
   * );
   * ```
   */
  enableRpcTracePropagation?: boolean;

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
   * Since a cached client outlives any single invocation, delivery cannot rely
   * on end-of-invocation flushes: captured events are flushed eagerly as they are
   * captured, so data captured in detached/background work is still delivered.
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
  invocationContext?: ExecutionContextCompat;
}
