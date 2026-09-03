// Bundled entrypoint, run directly with `node` (no `--import` runtime hook). `Sentry.init` runs
// first so the instrumentation's channel subscriber is ready, then the workload is imported and run.
// Spans are collected via the `spanEnd` hook (transport- and trace-lifecycle-independent) and written
// to the file named by `SENTRY_E2E_RESULT_FILE` for `assert.mjs` to read back. The workload's return
// value rides along as `result` so the assertion can check it without knowing what the workload does.
//
// The body is an async function rather than top-level await so the same source bundles to both ESM
// and CommonJS (esbuild emits CJS for a node target, which disallows top-level await).
import { writeFileSync } from 'node:fs';
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

  const { runWorkload } = await import('./app.mjs');

  let result;
  await Sentry.startSpan({ name: 'workload' }, async () => {
    result = await runWorkload();
  });

  await Sentry.flush(2000);

  const resultFile = process.env.SENTRY_E2E_RESULT_FILE;
  if (!resultFile) {
    throw new Error('SENTRY_E2E_RESULT_FILE is required (assertBundlerInstrumentation sets it).');
  }
  // Write synchronously so the payload is fully flushed before `process.exit`. `console.log` + exit
  // can truncate or EPIPE when stdout is a pipe (the exit lands before the buffered write drains).
  writeFileSync(resultFile, JSON.stringify({ result, spans }));
  process.exit(0);
}

void main();
