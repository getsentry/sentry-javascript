import * as Sentry from '@sentry/core';
import { Browser } from '../lib/Browser';

let sentry = new Sentry.Core('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291');
sentry.register(Browser);

sentry.install().then((results: Sentry.Integration.Result<boolean>[]) => {
  results.forEach((result: Sentry.Integration.Result<boolean>) => {
    console.log(result.sdk, result.value);
  });
});

sentry.captureMessage('PICKLE RIIIICK!');
