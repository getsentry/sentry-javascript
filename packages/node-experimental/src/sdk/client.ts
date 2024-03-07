import * as os from 'os';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { SDK_VERSION, ServerRuntimeClient, applySdkMetadata } from '@sentry/core';
import type { NodeClientOptions } from '../types';

/** A client for using Sentry with Node & OpenTelemetry. */
export class NodeClient extends ServerRuntimeClient<NodeClientOptions> {
  public traceProvider: BasicTracerProvider | undefined;
  private _tracer: Tracer | undefined;

  public constructor(options: NodeClientOptions) {
    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'node',
      runtime: { name: 'node', version: global.process.version },
      serverName: options.serverName || global.process.env.SENTRY_NAME || os.hostname(),
    };

    applySdkMetadata(clientOptions, 'node');

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

  /**
   * @inheritDoc
   */
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;
    const spanProcessor = provider?.activeSpanProcessor;

    if (spanProcessor) {
      await spanProcessor.forceFlush();
    }

    return super.flush(timeout);
  }
}
