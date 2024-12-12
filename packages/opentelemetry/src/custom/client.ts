import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import type { BaseClient, Client } from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import type { OpenTelemetryClient as OpenTelemetryClientInterface } from '../types';

// Typescript complains if we do not use `...args: any[]` for the mixin, with:
// A mixin class must have a constructor with a single rest parameter of type 'any[]'.ts(2545)
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Wrap an Client with things we need for OpenTelemetry support.
 *
 * Usage:
 * const OpenTelemetryClient = getWrappedClientClass(NodeClient);
 * const client = new OpenTelemetryClient(options);
 */
export function wrapClientClass<
  ClassConstructor extends new (
    ...args: any[]
  ) => Client & BaseClient<any>,
  WrappedClassConstructor extends new (
    ...args: any[]
  ) => Client & BaseClient<any> & OpenTelemetryClientInterface,
>(ClientClass: ClassConstructor): WrappedClassConstructor {
  class OpenTelemetryClient extends ClientClass implements OpenTelemetryClientInterface {
    public traceProvider: BasicTracerProvider | undefined;
    private _tracer: Tracer | undefined;

    public constructor(...args: any[]) {
      super(...args);
    }

    /** Get the OTEL tracer. */
    public get tracer(): Tracer {
      if (this._tracer) {
        return this._tracer;
      }

      const name = '@sentry/opentelemetry';
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

  return OpenTelemetryClient as unknown as WrappedClassConstructor;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
