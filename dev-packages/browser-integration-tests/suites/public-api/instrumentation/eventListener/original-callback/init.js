// store references to original, unwrapped built-ins in order to make assertions re: wrapped functions
window.originalBuiltIns = {
  addEventListener: document.addEventListener,
};

import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
