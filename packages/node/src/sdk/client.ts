import * as os from 'node:os';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { DynamicSamplingContext, Scope, TraceContext } from '@sentry/core';
import { _INTERNAL_flushLogsBuffer, applySdkMetadata, logger, SDK_VERSION, ServerRuntimeClient } from '@sentry/core';
import { getTraceContextForScope } from '@sentry/opentelemetry';
import { isMainThread, threadId } from 'worker_threads';
import { DEBUG_BUILD } from '../debug-build';
import type { NodeClientOptions } from '../types';
import { isCjs } from '../utils/commonjs';
import { envToBool } from '../utils/envToBool';
import { getSentryRelease } from './api';

const DEFAULT_CLIENT_REPORT_FLUSH_INTERVAL_MS = 60_000; // 60s was chosen arbitrarily

/** A client for using Sentry with Node & OpenTelemetry. */
export class NodeClient extends ServerRuntimeClient<NodeClientOptions> {
  public traceProvider: BasicTracerProvider | undefined;
  private _tracer: Tracer | undefined;
  private _clientReportInterval: NodeJS.Timeout | undefined;
  private _clientReportOnExitFlushListener: (() => void) | undefined;
  private _logOnExitFlushListener: (() => void) | undefined;

  public constructor(options: NodeClientOptions) {
    const clientOptions = applyDefaultOptions(options);

    if (clientOptions.openTelemetryInstrumentations) {
      registerInstrumentations({
        instrumentations: options.openTelemetryInstrumentations,
      });
    }

    applySdkMetadata(clientOptions, 'node');

    logger.log(
      `Initializing Sentry: process: ${process.pid}, thread: ${isMainThread ? 'main' : `worker-${threadId}`}.`,
    );
    logger.log(`Running in ${isCjs() ? 'CommonJS' : 'ESM'} mode.`);

    super(clientOptions);

    this.startClientReportTracking();

    if (this.getOptions()._experiments?.enableLogs) {
      this._logOnExitFlushListener = () => {
        _INTERNAL_flushLogsBuffer(this);
      };

      if (clientOptions.serverName) {
        this.on('beforeCaptureLog', log => {
          log.attributes = {
            ...log.attributes,
            'server.address': clientOptions.serverName,
          };
        });
      }

      process.on('beforeExit', this._logOnExitFlushListener);
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

    if (this._logOnExitFlushListener) {
      process.off('beforeExit', this._logOnExitFlushListener);
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

function applyDefaultOptions<T extends Partial<NodeClientOptions>>(options: T): T {
  const release = options.release ?? getSentryRelease();
  const spotlight =
    options.spotlight ?? envToBool(process.env.SENTRY_SPOTLIGHT, { strict: true }) ?? process.env.SENTRY_SPOTLIGHT;
  const tracesSampleRate = getTracesSampleRate(options.tracesSampleRate);
  const serverName = options.serverName || global.process.env.SENTRY_NAME || os.hostname();

  return {
    platform: 'node',
    runtime: { name: 'node', version: global.process.version },
    serverName,
    ...options,
    dsn: options.dsn ?? process.env.SENTRY_DSN,
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT,
    sendClientReports: options.sendClientReports ?? true,
    release,
    tracesSampleRate,
    spotlight,
    debug: envToBool(options.debug ?? process.env.SENTRY_DEBUG),
  };
}

/**
 * Tries to get a `tracesSampleRate`, possibly extracted from the environment variables.
 */
export function getTracesSampleRate(tracesSampleRate: NodeClientOptions['tracesSampleRate']): number | undefined {
  if (tracesSampleRate !== undefined) {
    return tracesSampleRate;
  }

  const sampleRateFromEnv = process.env.SENTRY_TRACES_SAMPLE_RATE;
  if (!sampleRateFromEnv) {
    return undefined;
  }

  const parsed = parseFloat(sampleRateFromEnv);
  return isFinite(parsed) ? parsed : undefined;
}
