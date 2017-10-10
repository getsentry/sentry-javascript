import * as Sentry from '../index';
import { JavaScript } from '../lib/Core/JavaScript';

let sentry = new Sentry.Core(process.env.DSN);
let node = sentry.register(JavaScript);

sentry.install().then((results: Sentry.Sdk.Result<boolean>[]) => {
  results.forEach((result: Sentry.Sdk.Result<boolean>) => {
    console.log(result.sdk, result.value);
  });
});

sentry.send({ message: 'test' }).then((results: Sentry.Sdk.Result<Sentry.Event>[]) => {
  console.log(results);
});
