import type * as S from '@sentry/node';
const Sentry = require('@sentry/node') as typeof S;

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  integrations: [],
  tracesSampleRate: 1,
  tunnel: 'http://localhost:3031/', // proxy server
  tracePropagationTargets: ['http://localhost:3030', '/external-allowed'],
});

import type * as H from 'http';
import type * as F from 'fastify';

// Make sure fastify is imported after Sentry is initialized
const { fastify } = require('fastify') as typeof F;
const http = require('http') as typeof H;

const app = fastify();
const port = 3030;
const port2 = 3040;

Sentry.setupFastifyErrorHandler(app);

app.get('/test-success', function (_req, res) {
  res.send({ version: 'v1' });
});

app.get<{ Params: { param: string } }>('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get<{ Params: { id: string } }>('/test-inbound-headers/:id', function (req, res) {
  const headers = req.headers;

  res.send({ headers, id: req.params.id });
});

app.get<{ Params: { id: string } }>('/test-outgoing-http/:id', async function (req, res) {
  const id = req.params.id;
  const data = await makeHttpRequest(`http://localhost:3030/test-inbound-headers/${id}`);

  res.send(data);
});

app.get<{ Params: { id: string } }>('/test-outgoing-fetch/:id', async function (req, res) {
  const id = req.params.id;
  const response = await fetch(`http://localhost:3030/test-inbound-headers/${id}`);
  const data = await response.json();

  res.send(data);
});

app.get('/test-transaction', async function (req, res) {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });

  res.send({});
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.get<{ Params: { id: string } }>('/test-exception/:id', async function (req, res) {
  throw new Error(`This is an exception with id ${req.params.id}`);
});

app.get('/test-outgoing-fetch-external-allowed', async function (req, res) {
  const fetchResponse = await fetch(`http://localhost:${port2}/external-allowed`);
  const data = await fetchResponse.json();

  res.send(data);
});

app.get('/test-outgoing-fetch-external-disallowed', async function (req, res) {
  const fetchResponse = await fetch(`http://localhost:${port2}/external-disallowed`);
  const data = await fetchResponse.json();

  res.send(data);
});

app.get('/test-outgoing-http-external-allowed', async function (req, res) {
  const data = await makeHttpRequest(`http://localhost:${port2}/external-allowed`);
  res.send(data);
});

app.get('/test-outgoing-http-external-disallowed', async function (req, res) {
  const data = await makeHttpRequest(`http://localhost:${port2}/external-disallowed`);
  res.send(data);
});

app.listen({ port: port });

// A second app so we can test header propagation between external URLs
const app2 = fastify();
app2.get('/external-allowed', function (req, res) {
  const headers = req.headers;

  res.send({ headers, route: '/external-allowed' });
});

app2.get('/external-disallowed', function (req, res) {
  const headers = req.headers;

  res.send({ headers, route: '/external-disallowed' });
});

app2.listen({ port: port2 });

function makeHttpRequest(url: string) {
  return new Promise(resolve => {
    const data: any[] = [];

    http
      .request(url, httpRes => {
        httpRes.on('data', chunk => {
          data.push(chunk);
        });
        httpRes.on('error', error => {
          resolve({ error: error.message, url });
        });
        httpRes.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(data).toString());
            resolve(json);
          } catch {
            resolve({ data: Buffer.concat(data).toString(), url });
          }
        });
      })
      .end();
  });
}
