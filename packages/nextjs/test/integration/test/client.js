const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

const next = require('next');
const puppeteer = require('puppeteer');

const { run } = require('./runner');
const {
  isSentryRequest,
  isEventRequest,
  isSessionRequest,
  isTransactionRequest,
  extractEventFromRequest,
  extractEnvelopeFromRequest,
  logIf,
} = require('./utils');

const setup = async () => {
  const app = next({ dev: false, dir: path.resolve(__dirname, '..') });
  const handle = app.getRequestHandler();
  await app.prepare();
  const server = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const browser = await puppeteer.launch({
    devtools: false,
  });

  return new Promise((resolve, reject) => {
    server.listen(0, err => {
      if (err) {
        reject(err);
      } else {
        resolve({
          browser,
          server,
          url: `http://localhost:${server.address().port}`,
        });
      }
    });
  });
};

const teardown = async ({ browser, server }) => {
  return Promise.all([browser.close(), new Promise(resolve => server.close(resolve))]);
};

const execute = async (scenario, env) => {
  const page = await env.browser.newPage();
  page.setDefaultTimeout(2000);
  page.on('console', msg => logIf(env.argv.debug, msg.text()));

  // Capturing requests this way allows us to have a reproducible, guaranteed order, as `Promise.all` does not do that.
  // Eg. this won't be enough: `const [resp1, resp2] = Promise.all([page.waitForRequest(isEventRequest), page.waitForRequest(isEventRequest)])`
  env.page = page;
  env.requests = {
    events: [],
    sessions: [],
    transactions: [],
  };

  await page.setRequestInterception(true);
  page.on('request', request => {
    if (
      isSentryRequest(request) ||
      // Used for testing http tracing
      request.url().includes('http://example.com')
    ) {
      request.respond({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      request.continue();
    }

    if (isEventRequest(request)) {
      logIf(env.argv.debug, 'Intercepted Event', extractEventFromRequest(request), env.argv.depth);
      env.requests.events.push(request);
    }

    if (isSessionRequest(request)) {
      logIf(env.argv.debug, 'Intercepted Session', extractEnvelopeFromRequest(request), env.argv.depth);
      env.requests.sessions.push(request);
    }

    if (isTransactionRequest(request)) {
      logIf(env.argv.debug, 'Intercepted Transaction', extractEnvelopeFromRequest(request), env.argv.depth);
      env.requests.transactions.push(request);
    }
  });

  return scenario(env);
};

run({
  setup,
  teardown,
  execute,
  scenariosDir: path.resolve(__dirname, './client'),
});
