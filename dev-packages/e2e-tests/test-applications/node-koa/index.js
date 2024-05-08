const Sentry = require('@sentry/node');

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  includeLocalVariables: true,
  debug: true,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
  tracePropagationTargets: ['http://localhost:3030', 'external-allowed'],
});

const port1 = 3030;
const port2 = 3040;

const Koa = require('koa');
const Router = require('@koa/router');
const http = require('http');

const app1 = new Koa();

Sentry.setupKoaErrorHandler(app1);

const router1 = new Router();

router1.get('/test-success', ctx => {
  ctx.body = { version: 'v1' };
});

router1.get('/test-param/:param', ctx => {
  ctx.body = { paramWas: ctx.params.param };
});

router1.get('/test-inbound-headers/:id', ctx => {
  const headers = ctx.request.headers;

  ctx.body = {
    headers,
    id: ctx.params.id,
  };
});

router1.get('/test-outgoing-http/:id', async ctx => {
  const id = ctx.params.id;
  const data = await makeHttpRequest(`http://localhost:3030/test-inbound-headers/${id}`);

  ctx.body = data;
});

router1.get('/test-outgoing-fetch/:id', async ctx => {
  const id = ctx.params.id;
  const response = await fetch(`http://localhost:3030/test-inbound-headers/${id}`);
  const data = await response.json();

  ctx.body = data;
});

router1.get('/test-transaction', ctx => {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });

  ctx.body = {};
});

router1.get('/test-error', async ctx => {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  ctx.body = { exceptionId };
});

router1.get('/test-exception', async ctx => {
  throw new Error('This is an exception');
});

router1.get('/test-exception/:id', async ctx => {
  throw new Error(`This is an exception with id ${ctx.params.id}`);
});

router1.get('/test-outgoing-fetch-external-allowed', async ctx => {
  const fetchResponse = await fetch(`http://localhost:${port2}/external-allowed`);
  const data = await fetchResponse.json();

  ctx.body = data;
});

router1.get('/test-outgoing-fetch-external-disallowed', async ctx => {
  const fetchResponse = await fetch(`http://localhost:${port2}/external-disallowed`);
  const data = await fetchResponse.json();

  ctx.body = data;
});

router1.get('/test-outgoing-http-external-allowed', async ctx => {
  const data = await makeHttpRequest(`http://localhost:${port2}/external-allowed`);
  ctx.body = data;
});

router1.get('/test-outgoing-http-external-disallowed', async ctx => {
  const data = await makeHttpRequest(`http://localhost:${port2}/external-disallowed`);
  ctx.body = data;
});

app1.use(router1.routes()).use(router1.allowedMethods());

app1.listen(port1);

const app2 = new Koa();
const router2 = new Router();

router2.get('/external-allowed', ctx => {
  const headers = ctx.headers;
  ctx.body = { headers, route: '/external-allowed' };
});

router2.get('/external-disallowed', ctx => {
  const headers = ctx.headers;
  ctx.body = { headers, route: '/external-disallowed' };
});

app2.use(router2.routes()).use(router2.allowedMethods());
app2.listen(port2);

function makeHttpRequest(url) {
  return new Promise(resolve => {
    const data = [];

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
