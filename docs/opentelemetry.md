# Sentry Tracer Provider

For application setup, first choose how Sentry and OpenTelemetry should work together using the
[OpenTelemetry setup guide](../MIGRATION.md#choosing-an-opentelemetry-setup).

`SentryTracerProvider` from `@sentry/opentelemetry` is a minimal OpenTelemetry tracer provider that creates native
Sentry spans directly. It is useful when code uses the global OpenTelemetry API and does not need the full
OpenTelemetry SDK span processor and exporter pipeline.

After initializing Sentry with tracing enabled, the provider can be registered with the OpenTelemetry API:

```js
import { trace } from '@opentelemetry/api';
import { SentryTracerProvider } from '@sentry/opentelemetry';

trace.setGlobalTracerProvider(new SentryTracerProvider());

const span = trace.getTracer('example').startSpan('work');
span.end();
```

Prefer the SDK's `enableOpenTelemetrySetup` option for application setup, as described in the setup guide. The example
above illustrates the provider itself; it does not configure context management or trace propagation.

`SentryTracerProvider` does not handle OpenTelemetry logs and metrics. If you already have your own OpenTelemetry
pipeline, follow the [custom setup guidance](../MIGRATION.md#3-your-own-opentelemetry-sentry-linked-to-it).
