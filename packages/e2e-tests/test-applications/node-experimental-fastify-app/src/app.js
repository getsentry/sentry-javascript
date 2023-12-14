require('./tracing');

const Sentry = require('@sentry/node-experimental');
const { fastify } = require('fastify');
const fastifyPlugin = require('fastify-plugin');
const http = require('http');

const FastifySentry = fastifyPlugin(async (fastify, options) => {
  fastify.decorateRequest('_sentryContext', null);

  fastify.addHook('onError', async (_request, _reply, error) => {
    Sentry.captureException(error);
  });
});

const app = fastify();
const port = 3030;

app.register(FastifySentry);

app.get('/test-success', (req, res) => {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', (req, res) => {
  res.send({ paramWas: req.params.param });
});

app.get('/test-inbound-headers', (req, res) => {
  const headers = req.headers;

  res.send({ headers });
});

app.get('/test-outgoing-http', async (req, res) => {
  const data = await makeHttpRequest('http://localhost:3030/test-inbound-headers');

  res.send(data);
});

app.get('/test-outgoing-fetch', async (req, res) => {
  const response = await fetch('http://localhost:3030/test-inbound-headers');
  const data = await response.json();

  res.send(data);
});

app.get('/test-transaction', async (req, res) => {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });

  res.send({});
});

app.get('/test-error', async (req, res) => {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.listen({ port: port });

function makeHttpRequest(url) {
  return new Promise(resolve => {
    const data = [];

    http
      .request(url, httpRes => {
        httpRes.on('data', chunk => {
          data.push(chunk);
        });
        httpRes.on('end', () => {
          const json = JSON.parse(Buffer.concat(data).toString());
          resolve(json);
        });
      })
      .end();
  });
}
