import type { Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api';
import type { SpanAttributes } from '@sentry/core';
import { SentryTracer } from './tracer';

/**
 * A minimal OpenTelemetry TracerProvider which creates native Sentry spans.
 */
export class SentryTracerProvider implements TracerProvider {
  public readonly resource?: { attributes: SpanAttributes };

  private readonly _tracers = new Map<string, SentryTracer>();

  public constructor(options: { resource?: { attributes: SpanAttributes } } = {}) {
    this.resource = options.resource;
  }

  /** @inheritdoc */
  public getTracer(name: string, version?: string, options?: TracerOptions): Tracer {
    const key = JSON.stringify([name, version, options]);
    const cachedTracer = this._tracers.get(key);
    if (cachedTracer) {
      return cachedTracer;
    }

    const tracer = new SentryTracer();
    this._tracers.set(key, tracer);
    return tracer;
  }

  /** Compatibility with SDK tracer providers. */
  public forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /** Compatibility with SDK tracer providers. */
  public shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
