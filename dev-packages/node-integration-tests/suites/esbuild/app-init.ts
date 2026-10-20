import * as Sentry from '@sentry/node';

// `Sentry.init()` synchronously calls `registerDiagnosticsChannelInjection()`, which reaches the
// vendored orchestrion transformer. That chain is split so a bundler can tree-shake it (see
// `makeCjsExportsSplitPlugin` in server-utils' rollup config); this asserts the split degrades to
// "no channel injection" rather than throwing when the bundler drops it.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 0,
  autoSessionTracking: false,
});

// eslint-disable-next-line no-console
console.log(`SENTRY_NODE_INITIALIZED client=${Boolean(Sentry.getClient())}`);
