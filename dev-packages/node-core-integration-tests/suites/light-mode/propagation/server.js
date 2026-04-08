const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

function makeHttpRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        headers,
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
  capturedHeaders = {
    'sentry-trace': req.headers['sentry-trace'],
    baggage: req.headers['baggage'],
  };
  res.writeHead(200);
  res.end('ok');
});

targetServer.listen(0, () => {
  const targetUrl = `http://localhost:${targetServer.address().port}/target`;

  const server = http.createServer(async (req, res) => {
    switch (req.url) {
      case '/test-propagation': {
        const traceData1 = Sentry.getTraceData();
        const traceData2 = Sentry.getTraceData();

        const spanId1 = traceData1['sentry-trace']?.split('-')[1];
        const spanId2 = traceData2['sentry-trace']?.split('-')[1];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ spanId1, spanId2 }));
        break;
      }
      case '/test-trace-continuation': {
        Sentry.captureException(new Error('Trace continuation error'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        break;
      }
      case '/test-outgoing-http': {
        capturedHeaders = {};
        const traceHeaders = Sentry.getTraceData();
        await makeHttpRequest(targetUrl, traceHeaders);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(capturedHeaders));
        break;
      }
      case '/test-outgoing-fetch': {
        capturedHeaders = {};
        const traceHeaders = Sentry.getTraceData();
        await fetch(targetUrl, { headers: traceHeaders });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(capturedHeaders));
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
