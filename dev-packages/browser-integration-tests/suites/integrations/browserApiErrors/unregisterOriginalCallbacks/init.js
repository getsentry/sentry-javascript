import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

const btn = document.getElementById('btn');

const myClickListener = () => {
  // eslint-disable-next-line no-console
  console.log('clicked');
};

btn.addEventListener('click', myClickListener);

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserApiErrorsIntegration({
      unregisterOriginalCallbacks: true,
    }),
  ],
});

btn.addEventListener('click', myClickListener);
