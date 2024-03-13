require('./tracing');

const Sentry = require('@sentry/node');
const { fastify } = require('fastify');
const http = require('http');

const app = fastify();
const port = 3030;

Sentry.setupFastifyErrorHandler(app);

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-inbound-headers', function (req, res) {
  const headers = req.headers;

  res.send({ headers });
});

app.get('/test-outgoing-http', async function (req, res) {
  const data = await makeHttpRequest('http://localhost:3030/test-inbound-headers');

  res.send(data);
});

app.get('/test-outgoing-fetch', async function (req, res) {
  const response = await fetch('http://localhost:3030/test-inbound-headers');
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

app.get('/test-exception', async function (req, res) {
  throw new Error('This is an exception');
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
