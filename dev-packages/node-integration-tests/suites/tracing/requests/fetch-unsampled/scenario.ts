import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  tracesSampleRate: 0,
  integrations: [],
  transport: loggingTransport,
});

async function run(): Promise<void> {
  // Wrap in span that is not sampled
  await Sentry.startSpan({ name: 'outer' }, async () => {
    await fetch(`${process.env.SERVER_URL}/api/v0`).then(res => res.text());
    await fetch(`${process.env.SERVER_URL}/api/v1`).then(res => res.text());
    await fetch(`${process.env.SERVER_URL}/api/v2`).then(res => res.text());
    await fetch(`${process.env.SERVER_URL}/api/v3`).then(res => res.text());
  });

  Sentry.captureException(new Error('foo'));
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
