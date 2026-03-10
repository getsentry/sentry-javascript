import { trace } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import * as Sentry from '@sentry/node-core/light';
import { otlpIntegration } from '@sentry/node-core/light/otlp';
import express from 'express';

const provider = new NodeTracerProvider({
  spanProcessors: [
    // The user's own exporter (sends to test proxy for verification)
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:3032/',
      }),
    ),
  ],
});

provider.register();

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  debug: true,
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // Use event proxy for testing
  integrations: [otlpIntegration({ captureExceptions: true })],
});

const app = express();
const port = 3030;
const tracer = trace.getTracer('test-app');

app.get('/test-error', (_req, res) => {
  Sentry.setTag('test', 'error');
  Sentry.captureException(new Error('Test error from light+otel'));
  res.status(500).json({ error: 'Error captured' });
});

app.get('/test-otel-span', (_req, res) => {
  tracer.startActiveSpan('test-span', span => {
    Sentry.captureException(new Error('Error inside OTel span'));
    span.end();
  });

  res.json({ ok: true });
});

app.get('/test-isolation/:userId', async (req, res) => {
  const userId = req.params.userId;

  // The light httpIntegration provides request isolation via diagnostics_channel.
  // This should still work alongside the OTLP integration.
  Sentry.setUser({ id: userId });
  Sentry.setTag('user_id', userId);

  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 50));

  const isolationScope = Sentry.getIsolationScope();
  const scopeData = isolationScope.getScopeData();

  const isIsolated = scopeData.user?.id === userId && scopeData.tags?.user_id === userId;

  res.json({
    userId,
    isIsolated,
    scope: {
      userId: scopeData.user?.id,
      userIdTag: scopeData.tags?.user_id,
    },
  });
});

app.get('/test-isolation-error/:userId', (req, res) => {
  const userId = req.params.userId;
  Sentry.setTag('user_id', userId);
  Sentry.setUser({ id: userId });

  Sentry.captureException(new Error(`Error for user ${userId}`));
  res.json({ userId, captured: true });
});

app.get('/test-record-exception', (_req, res) => {
  tracer.startActiveSpan('span-with-exception', span => {
    span.recordException(new Error('Recorded exception on span'));
    span.end();
  });

  res.json({ ok: true });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
