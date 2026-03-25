import * as Sentry from '@sentry/node';
import http from 'http';

async function run() {
  const traceData = Sentry.getTraceData();
  // fetch with manual getTraceData() headers - the core reproduction case from #19158
  await fetch(`${process.env.SERVER_URL}/api/fetch-custom-headers`, {
    headers: {
      ...traceData,
      'x-tracedata-sentry-trace': traceData['sentry-trace'],
      'x-tracedata-baggage': traceData.baggage,
    },
  }).then(res => res.text());

  // fetch without manual headers (baseline - auto-instrumentation only)
  await fetch(`${process.env.SERVER_URL}/api/fetch`, {
    headers: {
      'x-tracedata-sentry-trace': traceData['sentry-trace'],
      'x-tracedata-baggage': traceData.baggage,
    },
  }).then(res => res.text());

  // http.request with manual getTraceData() headers
  await new Promise((resolve, reject) => {
    const url = new URL(`${process.env.SERVER_URL}/api/http-custom-headers`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: {
          ...traceData,
          'x-tracedata-sentry-trace': traceData['sentry-trace'],
          'x-tracedata-baggage': traceData.baggage,
        },
      },
      res => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      },
    );
    req.on('error', reject);
    req.end();
  });

  Sentry.captureException(new Error('done'));
}

Sentry.startSpan({ name: 'parent_span' }, () => run());
