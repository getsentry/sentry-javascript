import * as os from 'node:os';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { DynamicSamplingContext, Scope, ServerRuntimeClientOptions, TraceContext } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient, applySdkMetadata, logger } from '@sentry/core';
import { getTraceContextForScope } from '@sentry/opentelemetry';
import { isMainThread, threadId } from 'worker_threads';
import { DEBUG_BUILD } from '../debug-build';
import type { NodeClientOptions } from '../types';

const DEFAULT_CLIENT_REPORT_FLUSH_INTERVAL_MS = 60_000; // 60s was chosen arbitrarily

/** A client for using Sentry with Node & OpenTelemetry. */
export class NodeClient extends ServerRuntimeClient<NodeClientOptions> {
  public traceProvider: BasicTracerProvider | undefined;
  private _tracer: Tracer | undefined;
  private _clientReportInterval: NodeJS.Timeout | undefined;
  private _clientReportOnExitFlushListener: (() => void) | undefined;

  public constructor(options: NodeClientOptions) {
    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'node',
      runtime: { name: 'node', version: global.process.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    if (options.openTelemetryInstrumentations) {
      registerInstrumentations({
        instrumentations: options.openTelemetryInstrumentations,
      });
    }

    applySdkMetadata(clientOptions, 'node');

    logger.log(
      `Initializing Sentry: process: ${process.pid}, thread: ${isMainThread ? 'main' : `worker-${threadId}`}.`,
    );

    super(clientOptions);
  }

  /** Get the OTEL tracer. */
  public get tracer(): Tracer {
    if (this._tracer) {
      return this._tracer;
    }

    const name = '@sentry/node';
    const version = SDK_VERSION;
    const tracer = trace.getTracer(name, version);
    this._tracer = tracer;

    return tracer;
  }

  // Eslint ignore explanation: This is already documented in super.
  // eslint-disable-next-line jsdoc/require-jsdoc
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;
    const spanProcessor = provider?.activeSpanProcessor;

    if (spanProcessor) {
      await spanProcessor.forceFlush();
    }

    if (this.getOptions().sendClientReports) {
      this._flushOutcomes();
    }

    return super.flush(timeout);
  }

  // Eslint ignore explanation: This is already documented in super.
  // eslint-disable-next-line jsdoc/require-jsdoc
  public close(timeout?: number | undefined): PromiseLike<boolean> {
    if (this._clientReportInterval) {
      clearInterval(this._clientReportInterval);
    }

    if (this._clientReportOnExitFlushListener) {
      process.off('beforeExit', this._clientReportOnExitFlushListener);
    }

    return super.close(timeout);
  }

  /**
   * Will start tracking client reports for this client.
   *
   * NOTICE: This method will create an interval that is periodically called and attach a `process.on('beforeExit')`
   * hook. To clean up these resources, call `.close()` when you no longer intend to use the client. Not doing so will
   * result in a memory leak.
   */
  // The reason client reports need to be manually activated with this method instead of just enabling them in a
  // constructor, is that if users periodically and unboundedly create new clients, we will create more and more
  // intervals and beforeExit listeners, thus leaking memory. In these situations, users are required to call
  // `client.close()` in order to dispose of the acquired resources.
  // We assume that calling this method in Sentry.init() is a sensible default, because calling Sentry.init() over and
  // over again would also result in memory leaks.
  // Note: We have experimented with using `FinalizationRegisty` to clear the interval when the client is garbage
  // collected, but it did not work, because the cleanup function never got called.
  public startClientReportTracking(): void {
    const clientOptions = this.getOptions();
    if (clientOptions.sendClientReports) {
      this._clientReportOnExitFlushListener = () => {
        this._flushOutcomes();
      };

      this._clientReportInterval = setInterval(() => {
        DEBUG_BUILD && logger.log('Flushing client reports based on interval.');
        this._flushOutcomes();
      }, clientOptions.clientReportFlushInterval ?? DEFAULT_CLIENT_REPORT_FLUSH_INTERVAL_MS)
        // Unref is critical for not preventing the process from exiting because the interval is active.
        .unref();

      process.on('beforeExit', this._clientReportOnExitFlushListener);
    }
  }

  /** Custom implementation for OTEL, so we can handle scope-span linking. */
  protected _getTraceInfoFromScope(
    scope: Scope | undefined,
  ): [dynamicSamplingContext: Partial<DynamicSamplingContext> | undefined, traceContext: TraceContext | undefined] {
    if (!scope) {
      return [undefined, undefined];
    }

    return getTraceContextForScope(this, scope);
  }
}
