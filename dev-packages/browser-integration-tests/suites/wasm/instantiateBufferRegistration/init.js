import * as Sentry from '@sentry/browser';
import { registerWebWorkerWasm } from '@sentry/wasm';

window.Sentry = Sentry;

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});

// `registerWebWorkerWasm` installs the same patches a worker would, and reports
// every registered module to the scope it is given. Collecting them here is the
// only way to observe registration from the page, since main-thread images stay
// module-internal until a frame matches one.
window.registeredImages = [];
registerWebWorkerWasm({
  self: {
    postMessage: message => window.registeredImages.push(...(message._sentryWasmImages || [])),
  },
});
