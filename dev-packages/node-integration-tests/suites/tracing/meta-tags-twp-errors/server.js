const { loggingTransport, startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');
console.log('X-4');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});
console.log('X-3');

// express must be required after Sentry is initialized
const express = require('express');
console.log('X-2');

const app = express();
console.log('X0');

app.get('/test', (_req, res) => {
  console.log('X1');
  Sentry.captureException('This is a test error');
  console.log('X2');
  // Sentry.getClient().on('beforeEnvelope', envelope => {
  //   console.log('X3');
  //   const event = envelope[1][0][1];
  //   if (event.exception.values[0].value === 'This is a test error') {
  //     console.log('X4');
  //     const { trace_id, span_id } = event.contexts.trace;
  //     res.send({
  //       traceData: Sentry.getTraceData(),
  //       traceMetaTags: Sentry.getTraceMetaTags(),
  //       errorTraceContext: {
  //         trace_id,
  //         span_id,
  //       },
  //     });
  //   }
  // });
});

Sentry.setupExpressErrorHandler(app);
console.log('X5');

startExpressServerAndSendPortToRunner(app);
console.log('X6');
