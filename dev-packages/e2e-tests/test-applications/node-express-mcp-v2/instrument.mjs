import * as Sentry from '@sentry/node';

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  // Registers the Sentry tracer provider, so the MCP SDK's built-in OpenTelemetry instrumentation records spans.
  enableOpenTelemetrySetup: process.env.MCP_SDK_OTEL === '1',
});
