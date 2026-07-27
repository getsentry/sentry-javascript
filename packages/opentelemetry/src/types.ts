import type { SpanKind } from '@opentelemetry/api';
import type { Scope, StartSpanOptions } from '@sentry/core';

export interface OpenTelemetrySpanContext extends StartSpanOptions {
  // Additional otel-only option, for now...?
  kind?: SpanKind;
}

export interface CurrentScopes {
  scope: Scope;
  isolationScope: Scope;
}
