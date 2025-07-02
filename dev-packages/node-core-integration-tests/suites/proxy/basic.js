const http = require('http');
const Sentry = require('@sentry/node-core');
const { createProxy } = require('proxy');
const { setupOtel } = require('../../utils/setupOtel.js');

const proxy = createProxy(http.createServer());
proxy.listen(0, () => {
  const proxyPort = proxy.address().port;

  const client = Sentry.init({
    dsn: process.env.SENTRY_DSN,
    transportOptions: {
      proxy: `http://localhost:${proxyPort}`,
    },
  });

  setupOtel(client);

  Sentry.captureMessage('Hello, via proxy!');
});
