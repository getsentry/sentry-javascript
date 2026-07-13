// Injected via `--require` by the runner so CJS scenarios don't need
// `setInterval(() => {}, 1000)` boilerplate to keep the loop alive while the
// SDK flushes envelopes.
//
// `beforeExit` fires when Node's loop has nothing left to do. Returning work
// from a beforeExit handler (here: `Sentry.flush()`, which awaits an internal
// timer in the logging transport) keeps the loop alive until that work
// settles — so queued spans/events are guaranteed to reach the transport
// before the process exits.
//
// `require('@sentry/node')` resolves to the CJS build of the SDK, so this
// only flushes the CJS-side client. For ESM scenarios we inject a matching
// `auto-flush.mjs` whose `import` resolves to the ESM client. They don't
// conflict — only the active module-system's client has events to flush; the
// other no-ops because `getClient()` returns undefined there.
process.on('beforeExit', () => {
  let Sentry;
  try {
    Sentry = require('@sentry/node');
  } catch {
    return;
  }
  Sentry.flush(2000).catch(() => {});
});
