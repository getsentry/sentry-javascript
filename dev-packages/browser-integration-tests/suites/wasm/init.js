import * as Sentry from '@sentry/browser';
import { wasmIntegration } from '@sentry/wasm';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [wasmIntegration()],
  beforeSend: event => {
    window.events.push(event);
    return null;
  },
});
