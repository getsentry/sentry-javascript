import * as https from 'https';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { defaultStackParser as browserStackParser } from '@sentry/browser';
import { handleReportingApi } from '@sentry/core';
import * as Sentry from '@sentry/node';

const __dirname = new URL('.', import.meta.url).pathname;

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';

const app = express();

app.use(express.json({ type: 'application/reports+json' }));

app.post('/reporting-api', async (req, res) => {
  await handleReportingApi(req.body, browserStackParser);
  res.sendStatus(200);
});

const port = 9000;

app.get('/', (req, res) => {
  const file = readFileSync(join(__dirname, 'index.html'), { encoding: 'utf-8' });

  res.setHeader('Content-Type', 'text/html');
  res.setHeader(
    'Reporting-Endpoints',
    `csp-endpoint="https://localhost:${port}/reporting-api", default="https://localhost:${port}/reporting-api"`,
  );
  res.setHeader('Content-Security-Policy', "default-src 'self'; report-to csp-endpoint");
  res.setHeader(
    'Origin-Trial',
    'ApD+E2izWNtaaRBeZ5BXu46aV0l1MSUzJTPERkU3yf+53pAOHj3rARpjb08itVJklPYx7iNEv5//s2dtXUFIvgMAAABzeyJvcmlnaW4iOiJodHRwczovL2xvY2FsaG9zdDo5MDAwIiwiZmVhdHVyZSI6IkRvY3VtZW50UG9saWN5SW5jbHVkZUpTQ2FsbFN0YWNrc0luQ3Jhc2hSZXBvcnRzIiwiZXhwaXJ5IjoxNzQyMzQyMzk5fQ==',
  );
  res.setHeader('Document-Policy', 'include-js-call-stacks-in-crash-reports');
  res.send(file);
});

const options = {
  key: readFileSync(join(__dirname, 'localhost-key.pem')),
  cert: readFileSync(join(__dirname, 'localhost.pem')),
};

const server = https.createServer(options, app);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`{"port":${port}}`);
});
