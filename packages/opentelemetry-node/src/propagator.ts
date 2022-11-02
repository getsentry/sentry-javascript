import { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';

import { SENTRY_BAGGAGE_HEADER, SENTRY_TRACE_HEADER } from './constants';

/**
 * Injects and extracts `sentry-trace` and `baggage` headers from carriers.
 */
export class SentryPropagator implements TextMapPropagator {
  /**
   * @inheritDoc
   */
  public inject(_context: Context, _carrier: unknown, _setter: TextMapSetter): void {
    // no-op
  }

  /**
   * @inheritDoc
   */
  public extract(context: Context, _carrier: unknown, _getter: TextMapGetter): Context {
    return context;
  }

  /**
   * @inheritDoc
   */
  public fields(): string[] {
    return [SENTRY_TRACE_HEADER, SENTRY_BAGGAGE_HEADER];
  }
}
