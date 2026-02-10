const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracePropagationTargets: [/\/api\/v0/, 'v1'],
});

// Target server that captures headers from outgoing requests
let capturedHeaders = {};
const targetServer = http.createServer((req, res) => {
  capturedHeaders[req.url] = {
    'sentry-trace': req.headers['sentry-trace'],
    baggage: req.headers['baggage'],
  };
  res.writeHead(200);
  res.end('ok');
});

targetServer.listen(0, () => {
  const targetPort = targetServer.address().port;
  const targetUrl = `http://localhost:${targetPort}`;

  const server = http.createServer(async (req, res) => {
    switch (req.url) {
      case '/test-auto-propagation': {
        capturedHeaders = {};
        await fetch(`${targetUrl}/api/v0`);
        await fetch(`${targetUrl}/api/v1`);
        await fetch(`${targetUrl}/api/v2`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(capturedHeaders));
        break;
      }
      case '/test-breadcrumbs': {
        Sentry.addBreadcrumb({ message: 'manual breadcrumb' });
        await fetch(`${targetUrl}/api/v0`);
        await fetch(`${targetUrl}/api/v1`);
        Sentry.captureException(new Error('foo'));
        res.writeHead(200);
        res.end('ok');
        break;
      }
      default: {
        res.writeHead(404);
        res.end();
      }
    }
  });

  server.listen(0, () => {
    sendPortToRunner(server.address().port);
  });
});
