// Injected via `--import` by the runner for ESM scenarios. See
// `auto-flush.cjs` for the rationale — this is the ESM-loader counterpart so
// the SDK instance we flush is the same one the scenario's `import` resolves.
import * as Sentry from '@sentry/node';

process.on('beforeExit', () => {
  Sentry.flush(2000).catch(() => {});
});
