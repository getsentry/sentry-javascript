import type { ClientOptions, Options, ServerRuntimeClientOptions } from '@sentry/core';
import {
  _INTERNAL_clearAiProviderSkips,
  applySdkMetadata,
  debug,
  ServerRuntimeClient,
  spanIsSampled,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { ExecutionContextCompat } from './executionContext';
import type { makeFlushLock } from './flush';
import type { CloudflareTransportOptions } from './transport';

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

    // Track span lifecycle to know when to flush
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
}

interface BaseCloudflareOptions {
  /**
   * @ignore Used internally to disable the deDupeIntegration for workflows.
   * @hidden Used internally to disable the deDupeIntegration for workflows.
   * @default true
   */
  enableDedupe?: boolean;

  /**
   * The Cloudflare SDK is not OpenTelemetry native. By default (`true`) it does not set up a tracer
   * provider; spans are emitted via the SDK's own instrumentation and scopes are isolated with
   * AsyncLocalStorage.
   *
   * Set this to `false` to opt into the OpenTelemetry compatibility tracer, which captures spans
   * emitted via `@opentelemetry/api`. Big caveat: it does not handle custom context, always working
   * off the current scope. This is good enough for many, but not all, integrations.
   *
   * @default true
   */
  skipOpenTelemetrySetup?: boolean;

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
   * **Important:** This option is enabled by default. Set it to `false` to opt out, e.g. if you
   * do not want trace context to leave your Worker via RPC calls.
   *
   * @default true
   * @example
   * ```ts
   * // Opt out of RPC trace propagation
   * export default Sentry.withSentry(
   *   (env) => ({
   *     dsn: env.SENTRY_DSN,
   *     enableRpcTracePropagation: false,
   *   }),
   *   handler,
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
