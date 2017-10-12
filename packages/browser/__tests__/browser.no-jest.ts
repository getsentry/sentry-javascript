import * as Sentry from '@sentry/core';
import { Browser } from '../lib/Browser';

let sentry = new Sentry.Core('https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291');
sentry.register(Browser.Client);

sentry.install().then((results: Sentry.Sdk.Result<boolean>[]) => {
  results.forEach((result: Sentry.Sdk.Result<boolean>) => {
    console.log(result.sdk, result.value);
  });
});

sentry.captureMessage('PICKLE RIIIICK!');
