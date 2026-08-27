import * as Sentry from '@sentry/node';

const spans = [];

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  // Nothing leaves the process: spans are collected here and the transport is a no-op, so the
  // bundle runs offline against a fake DSN.
  transport: () => ({ send: async () => ({}), flush: async () => true }),
  beforeSendSpan(span) {
    spans.push({ name: span.name, origin: span.attributes?.['sentry.origin'] });

    return span;
  },
});

const { runQuery } = await import('./app.mjs');

await Sentry.startSpan({ name: 'graphql-work', op: 'test' }, runQuery);
await Sentry.flush(2000);

const { runtime = [], bundler = [] } = globalThis.__SENTRY_ORCHESTRION__ ?? {};

// eslint-disable-next-line no-console
console.log(
  `SENTRY_RESULT=${JSON.stringify({
    injected: { runtime, bundler: Array.isArray(bundler) ? bundler : [...bundler] },
    spans,
  })}`,
);
