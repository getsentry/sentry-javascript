import * as os from 'node:os';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient, applySdkMetadata } from '@sentry/core';
import { logger } from '@sentry/utils';
import { isMainThread, threadId } from 'worker_threads';
import { DEBUG_BUILD } from '../debug-build';
import type { NodeClientOptions } from '../types';

const CLIENT_REPORT_FLUSH_INTERVAL_MS = 60_000; // 60s was chosen arbitrarily

/** A client for using Sentry with Node & OpenTelemetry. */
export class NodeClient extends ServerRuntimeClient<NodeClientOptions> {
  public traceProvider: BasicTracerProvider | undefined;
  private _tracer: Tracer | undefined;
  private _clientReportInterval: NodeJS.Timeout | undefined;
  private _clientReportOnExitFlushListener: (() => undefined) | undefined;

  public constructor(options: NodeClientOptions) {
    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'node',
      runtime: { name: 'node', version: global.process.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    applySdkMetadata(clientOptions, 'node');

    logger.log(
      `Initializing Sentry: process: ${process.pid}, thread: ${isMainThread ? 'main' : `worker-${threadId}`}.`,
    );

    super(clientOptions);

    if (clientOptions.sendClientReports !== false) {
      // There is one mild concern here, being that if users periodically and unboundedly create new clients, we will
      // create more and more intervals and beforeExit listeners, which may leak memory. In these situations, users are
      // required to call `client.close()` in order to dispose of the acquired resources.
      // Users are already confronted with the same reality with the SessionFlusher at the time of writing this so the
      // working theory is that this should be fine.
      // Note: We have experimented with using `FinalizationRegisty` to clear the interval when the client is garbage
      // collected, but it did not work, because the cleanup function never got called.
      this._clientReportInterval = setInterval(() => {
        DEBUG_BUILD && logger.log('Flushing client reports based on interval.');
        this._flushOutcomes();
      }, CLIENT_REPORT_FLUSH_INTERVAL_MS)
        // Unref is critical, otherwise we stop the process from exiting by itself
        .unref();

      this._clientReportOnExitFlushListener = () => {
        this._flushOutcomes();
      };

      process.on('beforeExit', this._clientReportOnExitFlushListener);
    }
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

    this._flushOutcomes();

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
}
