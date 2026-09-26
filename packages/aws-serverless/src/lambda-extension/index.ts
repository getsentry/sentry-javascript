#!/usr/bin/env node
import { AwsLambdaExtension } from './aws-lambda-extension';
import { main } from './main';
import { logError, park } from './utils';

// An unhandled rejection ends the process, and a process ending outside the shutdown phase is
// reported as `Extension.Crash` against the invocation in flight. Parked rather than exited for the
// same reason `main` parks: whatever failed here, the tunnel may still be serving envelopes.
main(new AwsLambdaExtension()).catch(err => {
  logError('the extension stopped unexpectedly.', err);
  park();
});
