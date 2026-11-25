import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import { fastify } from 'fastify';
import * as http from 'node:http';
import * as Sentry from './sentry';

export const app = fastify();
const port2 = 3040;

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

// Regression test for https://github.com/fastify/fastify/issues/6409
// The error diagnostic channel was always sending 200 unless explicitly changed.
// This was fixed in Fastify 5.7.0
app.register((childApp: FastifyInstance, _options: FastifyPluginOptions, next: (err?: Error) => void) => {
  childApp.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ ok: false });
  });

  childApp.get('/test-error-ignored', async function () {
    throw new Error('This is an error that will not be captured');
  });

  next();
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

app.get('/test-log', function (_req, res) {
  Sentry.logger.debug('Accessed /test-log route');
  res.send({ message: 'Log sent' });
});

app.get<{ Params: { id: string } }>('/test-isolation/:id', async function (req, res) {
  Sentry.setTag('isolation-id', req.params.id);
  // Lets the concurrent requests of the isolation test overlap.
  await new Promise(resolve => setTimeout(resolve, 200));
  Sentry.captureException(new Error(`Isolated error ${req.params.id}`));
  res.send({});
});

app.post('/test-post', function (req, res) {
  res.send({ status: 'ok', body: req.body });
});

app.get('/flush', async function (_req, res) {
  await Sentry.flush();
  res.send({ ok: true });
});

// A second app so we can test header propagation between external URLs
export const app2 = fastify();
app2.get('/external-allowed', function (req, res) {
  const headers = req.headers;

  res.send({ headers, route: '/external-allowed' });
});

app2.get('/external-disallowed', function (req, res) {
  const headers = req.headers;

  res.send({ headers, route: '/external-disallowed' });
});

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
