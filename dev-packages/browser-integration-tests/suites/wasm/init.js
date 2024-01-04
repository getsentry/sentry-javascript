import * as Sentry from '@sentry/browser';
import { Wasm } from '@sentry/wasm';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Wasm()],
  beforeSend: event => {
    window.events.push(event);
    return null;
  },
});
