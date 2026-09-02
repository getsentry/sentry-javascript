import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  enableOpenTelemetrySetup: true,
});

let initializeSpansStarted = 0;
Sentry.getClient()?.on('spanStart', span => {
  const attributes = Sentry.spanToJSON(span).attributes;
  if (attributes['sentry.op'] === 'mcp.server' && attributes['mcp.method.name'] === 'initialize') {
    initializeSpansStarted += 1;
    span.setAttribute('test.mcp.initialize_spans_started', initializeSpansStarted);
  }
});
