const http = require('http');
const Sentry = require('@sentry/node-core/light');
const { loggingTransport, sendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const server = http.createServer((req, res) => {
  if (req.url === '/test-propagation') {
    const traceData1 = Sentry.getTraceData();
    const traceData2 = Sentry.getTraceData();

    const spanId1 = traceData1['sentry-trace']?.split('-')[1];
    const spanId2 = traceData2['sentry-trace']?.split('-')[1];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ spanId1, spanId2 }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, () => {
  sendPortToRunner(server.address().port);
});
