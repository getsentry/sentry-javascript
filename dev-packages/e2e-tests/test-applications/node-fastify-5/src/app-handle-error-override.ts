import type * as S from '@sentry/node';
const Sentry = require('@sentry/node') as typeof S;

// We wrap console.warn to find out if a warning is incorrectly logged
console.warn = new Proxy(console.warn, {
  apply: function (target, thisArg, argumentsList) {
    const msg = argumentsList[0];
    if (typeof msg === 'string' && msg.startsWith('[Sentry]')) {
      console.error(`Sentry warning was triggered: ${msg}`);
      process.exit(1);
    }

    return target.apply(thisArg, argumentsList);
  },
});

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  integrations: [
    Sentry.fastifyIntegration({
      shouldHandleError: (error, _request, _reply) => {
        return true;
      },
    }),
  ],
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

Sentry.setupFastifyErrorHandler(app, {
  shouldHandleError: (error, _request, _reply) => {
    // @ts-ignore // Fastify V5 is not typed correctly
    if (_request.routeOptions?.url?.includes('/test-error-not-captured')) {
      // Errors from this path will not be captured by Sentry
      return false;
    }

    // @ts-ignore // Fastify V5 is not typed correctly
    if (_request.routeOptions?.url?.includes('/test-error-ignored') && _reply.statusCode === 500) {
      return false;
    }

    return true;
  },
});

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

app.get('/test-error-not-captured', async function () {
  // This error will not be captured by Sentry
  throw new Error('This is an error that will not be captured');
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

// Regression test for https://github.com/fastify/fastify/issues/6409
// The error diagnostic channel was always sending 200 unless explicitly changed.
// This was fixed in Fastify 5.7.0
app.register((childApp: F.FastifyInstance, _options: F.FastifyPluginOptions, next: (err?: Error) => void) => {
  childApp.setErrorHandler((error: Error, _request: F.FastifyRequest, reply: F.FastifyReply) => {
    reply.send({ ok: false });
  });

  childApp.get('/test-error-ignored', async function () {
    throw new Error('This is an error that will not be captured');
  });

  next();
});

app.post('/test-post', function (req, res) {
  res.send({ status: 'ok', body: req.body });
});

app.get('/flush', async function (_req, res) {
  await Sentry.flush();
  res.send({ ok: true });
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
