import * as Sentry from '@sentry/core';
import { Browser } from '../lib/Browser';

let sentry = new Sentry.Core(
  'https://3d7a8ff40b8e4a769cb11288e0e8e630@dgriesser-7b0957b1732f38a5e205.eu.ngrok.io/1'
);
sentry.register(Browser.Client);

sentry.install().then((results: Sentry.Sdk.Result<boolean>[]) => {
  results.forEach((result: Sentry.Sdk.Result<boolean>) => {
    console.log(result.sdk, result.value);
  });
});

sentry
  .captureMessage('PICKLE RIIIICK!')
  .then((result: Sentry.Sdk.Result<Sentry.Event>) => {
    console.log(result);
  });
