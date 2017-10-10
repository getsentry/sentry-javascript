import * as Sentry from '../index';
import { Node } from '../lib/Backend/Node';

let sentry = new Sentry.Core(process.env.DSN);
let node = sentry.register(Node);

sentry.install().then((results: Sentry.Sdk.Result<boolean>[]) => {
  results.forEach((result: Sentry.Sdk.Result<boolean>) => {
    if (result.sdk instanceof Node) {
      console.log(result.sdk.getProcess());
    }
    console.log(result.sdk, result.value);
  });
});

sentry.send({ message: 'test' }).then((results: Sentry.Sdk.Result<Sentry.Event>[]) => {
  console.log(results);
});
