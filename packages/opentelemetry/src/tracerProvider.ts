import type { Tracer, TracerOptions, TracerProvider } from '@opentelemetry/api';
import { SentryTracer } from './tracer';

/**
 * A minimal OpenTelemetry TracerProvider which creates native Sentry spans.
 */
export class SentryTracerProvider implements TracerProvider {
  private readonly _tracers = new Map<string, SentryTracer>();

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
