import { Context as OpenTelemetryContext, TextMapPropagator } from '@opentelemetry/api';

const SENTRY_TRACE_HEADER = 'sentry-trace';

const BAGGAGE_HEADER = 'baggage';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropogator implements TextMapPropagator {
  /**
   * @inheritDoc
   */
  public inject(context: OpenTelemetryContext, carrier: unknown, setter: TextMapSetter): void {}

  /**
   * @inheritDoc
   */
  public extract(context: OpenTelemetryContext, carrier: unknown, getter: TextMapGetter): OpenTelemetryContext {
    return context;
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, BAGGAGE_HEADER];
  }
}
