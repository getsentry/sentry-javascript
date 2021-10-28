const path = require('path');
const puppeteer = require('puppeteer');
const { run } = require('./runner');
const { createNextServer, startServer } = require('./utils/common');
const { createRequestInterceptor } = require('./utils/client');

const setup = async () => {
  const server = await createNextServer({ dev: false, dir: path.resolve(__dirname, '..') });
  const browser = await puppeteer.launch({
    devtools: false,
  });
  return startServer(server, { browser });
};

const teardown = async ({ browser, server }) => {
  return Promise.all([browser.close(), new Promise(resolve => server.close(resolve))]);
};

const execute = async (scenario, env) => {
  // Capturing requests this way allows us to have a reproducible, guaranteed order, as `Promise.all` does not do that.
  // Eg. this won't be enough: `const [resp1, resp2] = Promise.all([page.waitForRequest(isEventRequest), page.waitForRequest(isEventRequest)])`
  env.requests = {
    events: [],
    sessions: [],
    transactions: [],
  };

  const page = (env.page = await env.browser.newPage());
  await page.setRequestInterception(true);
  page.setDefaultTimeout(4000);
  page.on('request', createRequestInterceptor(env));

  return scenario(env);
};

run({
  setup,
  teardown,
  execute,
  scenariosDir: path.resolve(__dirname, './client'),
});
