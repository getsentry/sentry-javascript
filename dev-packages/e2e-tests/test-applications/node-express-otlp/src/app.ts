import { trace } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import * as Sentry from '@sentry/node';
import express from 'express';

const dsn = process.env.E2E_TEST_DSN as string;
const appPort = 3030;
const otlpReceiverPort = 3033;

const otlpTracesEndpoint = Sentry.getOtlpTracesEndpoint(dsn);
if (!otlpTracesEndpoint) {
  throw new Error(`Could not derive an OTLP traces endpoint from E2E_TEST_DSN: ${dsn}`);
}

// The user brings their own OpenTelemetry setup. In production `url` would be
// `otlpTracesEndpoint.url`; here it points at the local receiver below so the test can assert what
// was actually exported. The auth headers are the real DSN-derived ones either way.
const provider = new NodeTracerProvider({
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: `http://localhost:${otlpReceiverPort}/v1/traces`,
        headers: otlpTracesEndpoint.headers,
      }),
      { scheduledDelayMillis: 100 },
    ),
  ],
});

provider.register();

Sentry.init({
  dsn,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  integrations: [Sentry.otlpIntegration()],
});

interface ExportedTrace {
  traceId: string;
  spanIds: string[];
  sentryAuthHeader?: string;
}

const exportedTraces: ExportedTrace[] = [];

const otlpReceiver = express();
otlpReceiver.use(express.json({ limit: '10mb' }));

otlpReceiver.post('/v1/traces', (req, res) => {
  const sentryAuthHeader = req.header('x-sentry-auth');

  for (const resourceSpan of req.body?.resourceSpans ?? []) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        const existing = exportedTraces.find(entry => entry.traceId === span.traceId);
        if (existing) {
          existing.spanIds.push(span.spanId);
        } else {
          exportedTraces.push({ traceId: span.traceId, spanIds: [span.spanId], sentryAuthHeader });
        }
      }
    }
  }

  res.json({});
});

otlpReceiver.listen(otlpReceiverPort);

const app = express();
const tracer = trace.getTracer('node-express-otlp');

app.get('/test-error/:id', (req, res) => {
  tracer.startActiveSpan('test-error-handler', span => {
    const { traceId, spanId } = span.spanContext();

    Sentry.captureException(new Error(`This is an exception with id ${req.params.id}`));
    span.end();

    res.json({ traceId, spanId });
  });
});

app.get('/otlp-exported-traces', (_req, res) => {
  res.json(exportedTraces);
});

app.listen(appPort);
