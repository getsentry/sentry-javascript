const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  sendDefaultPii: true,
});

const server = http.createServer((req, res) => {
  if (req.url === '/test-error') {
    Sentry.captureException(new Error('test error'));
    res.writeHead(200);
    res.end('ok');
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
