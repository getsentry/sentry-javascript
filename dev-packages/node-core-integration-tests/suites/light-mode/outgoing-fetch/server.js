const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracePropagationTargets: [/\/api\/v0/, 'v1'],
});

let capturedV0 = {};
let capturedV1 = {};
let capturedV2 = {};

const targetServer = http.createServer((req, res) => {
  const headers = {
    'sentry-trace': req.headers['sentry-trace'],
    baggage: req.headers['baggage'],
  };

  if (req.url === '/api/v0') {
    capturedV0 = headers;
  } else if (req.url === '/api/v1') {
    capturedV1 = headers;
  } else if (req.url === '/api/v2') {
    capturedV2 = headers;
  }

  res.writeHead(200);
  res.end('ok');
});

targetServer.listen(0, () => {
  const targetPort = targetServer.address().port;
  const targetUrl = `http://localhost:${targetPort}`;

  const server = http.createServer(async (req, res) => {
    switch (req.url) {
      case '/test-auto-propagation': {
        capturedV0 = {};
        capturedV1 = {};
        capturedV2 = {};
        await fetch(`${targetUrl}/api/v0`);
        await fetch(`${targetUrl}/api/v1`);
        await fetch(`${targetUrl}/api/v2`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ '/api/v0': capturedV0, '/api/v1': capturedV1, '/api/v2': capturedV2 }));
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
