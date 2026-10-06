import * as Sentry from '@sentry/browser';
import { wasmIntegration } from '@sentry/wasm';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [wasmIntegration({ applicationKey: 'wasm-worker-app' })],
});

const worker = new Worker('/worker.js');

Sentry.addIntegration(Sentry.webWorkerIntegration({ worker }));

window.wasmWorker = worker;
