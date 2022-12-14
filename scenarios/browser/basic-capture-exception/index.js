import { init } from '@sentry/browser';
import { captureException } from '@sentry/core';

init({
  dsn: 'https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000',
});

captureException(new Error('error here!'));
