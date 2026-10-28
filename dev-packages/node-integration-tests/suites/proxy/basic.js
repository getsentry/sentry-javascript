const http = require('http');
const Sentry = require('@sentry/node');
const { createProxy } = require('proxy');

const proxy = createProxy(http.createServer());
proxy.listen(0, () => {
  const proxyPort = proxy.address().port;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    transportOptions: {
      proxy: `http://localhost:${proxyPort}`,
    },
  });

  Sentry.captureMessage('Hello, via proxy!');
});
