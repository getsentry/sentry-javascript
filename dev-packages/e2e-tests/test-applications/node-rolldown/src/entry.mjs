// Bundled entrypoint, run directly with `node` (no `--import` runtime hook). `Sentry.init` runs
// first so the graphql channel subscriber is ready, then the workload is imported and run. Spans are
// collected via the `spanEnd` hook (transport- and trace-lifecycle-independent) and printed as a
// single machine-readable line for `assert.mjs`.
//
// The body is an async function rather than top-level await so the same source bundles to both ESM
// and CommonJS (esbuild emits CJS for a node target, which disallows top-level await).
import * as Sentry from '@sentry/node';

async function main() {
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1,
    // Isolate the build-time path: with the runtime hook off, the bundler plugin is the only possible
    // injector, so a `plain` (no-plugin) build is a true negative.
    enableRuntimeChannelInjection: false,
    // Hermetic — never hit the network.
    transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
  });

  const spans = [];
  Sentry.getClient()?.on('spanEnd', span => {
    const json = Sentry.spanToJSON(span);
    spans.push({ name: json.name, origin: json.attributes?.['sentry.origin'] });
  });

  const { runGraphqlQuery } = await import('./app.mjs');

  let data;
  await Sentry.startSpan({ name: 'graphql-work' }, async () => {
    const result = await runGraphqlQuery();
    data = result.data;
  });

  await Sentry.flush(2000);

  // eslint-disable-next-line no-console
  console.log(`__RESULT__${JSON.stringify({ data, spans })}`);
  process.exit(0);
}

void main();
