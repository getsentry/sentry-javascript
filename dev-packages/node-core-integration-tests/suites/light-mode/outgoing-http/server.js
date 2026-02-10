const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracePropagationTargets: [/\/api\/v0/, 'v1'],
  beforeBreadcrumb(breadcrumb, hint) {
    breadcrumb.data = breadcrumb.data || {};
    const req = hint?.request;
    if (req?.path) {
      breadcrumb.data.ADDED_PATH = req.path;
    }
    return breadcrumb;
  },
});

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
      },
      res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.end();
  });
}

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
        await makeHttpRequest(`${targetUrl}/api/v0`);
        await makeHttpRequest(`${targetUrl}/api/v1`);
        await makeHttpRequest(`${targetUrl}/api/v2`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(capturedHeaders));
        break;
      }
      case '/test-breadcrumbs': {
        Sentry.addBreadcrumb({ message: 'manual breadcrumb' });
        await makeHttpRequest(`${targetUrl}/api/v0`);
        await makeHttpRequest(`${targetUrl}/api/v1`);
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
