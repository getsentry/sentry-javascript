import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import { captureReportingApi } from '@sentry/core';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import express from 'express';

const app = express();

app.post('/reporting-api', express.json({ type: 'application/reports+json' }), async (req, res) => {
  await captureReportingApi(req.body);
  res.sendStatus(200);
});

startExpressServerAndSendPortToRunner(app);

// Below is to support testing with a browser. We don't test this yet because we don't want to add the overhead of
// installing playwright to the node-integration-tests. We should consider this in the future.

// const port = 9000;

// app.get('/', (req, res) => {
//   const file = readFileSync(join(__dirname, 'index.html'), { encoding: 'utf-8' });

//   res.setHeader('Content-Type', 'text/html');
//   res.setHeader(
//     'Reporting-Endpoints',
//     `csp-endpoint="https://localhost:${port}/reporting-api", default="https://localhost:${port}/reporting-api"`,
//   );
//   res.setHeader('Content-Security-Policy', "default-src 'self'; report-to csp-endpoint");
//   res.setHeader('Document-Policy', 'include-js-call-stacks-in-crash-reports');
//   res.setHeader(
//     'Origin-Trial',
//     'ApD+E2izWNtaaRBeZ5BXu46aV0l1MSUzJTPERkU3yf+53pAOHj3rARpjb08itVJklPYx7iNEv5//s2dtXUFIvgMAAABzeyJvcmlnaW4iOiJodHRwczovL2xvY2FsaG9zdDo5MDAwIiwiZmVhdHVyZSI6IkRvY3VtZW50UG9saWN5SW5jbHVkZUpTQ2FsbFN0YWNrc0luQ3Jhc2hSZXBvcnRzIiwiZXhwaXJ5IjoxNzQyMzQyMzk5fQ==',
//   );
//   res.send(file);
// });

// const options = {
//   key: readFileSync(join(__dirname, 'localhost-key.pem')),
//   cert: readFileSync(join(__dirname, 'localhost.pem')),
// };

// const server = https.createServer(options, app);

// server.listen(port, () => {
//   // eslint-disable-next-line no-console
//   console.log(`{"port":${port}}`);
// });
