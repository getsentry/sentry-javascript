import * as Sentry from '@sentry/node';
import http from 'http';

async function run() {
  // fetch with manual getTraceData() headers - the core reproduction case from #19158
  await fetch(`${process.env.SERVER_URL}/api/v0`, {
    headers: { ...Sentry.getTraceData() },
  }).then(res => res.text());

  // fetch without manual headers (baseline - auto-instrumentation only)
  await fetch(`${process.env.SERVER_URL}/api/v1`).then(res => res.text());

  // http.request with manual getTraceData() headers
  await new Promise((resolve, reject) => {
    const url = new URL(`${process.env.SERVER_URL}/api/v2`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'GET',
        headers: Sentry.getTraceData(),
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

run();
