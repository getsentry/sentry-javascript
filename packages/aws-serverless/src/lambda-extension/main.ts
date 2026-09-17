import type { AwsLambdaExtension } from './aws-lambda-extension';
import { MAX_TIMER_DELAY_MS } from './constants';
import { logError } from './utils';

/**
 * Runs the extension for the life of the execution environment.
 *
 * `exit` is a parameter so the three outcomes can be asserted; there is one of each, and which one
 * runs is the whole argument of this file.
 */
export async function main(
  extension: AwsLambdaExtension,
  exit: (code: number) => void = code => process.exit(code),
): Promise<void> {
  // Before registering: the listening socket is the referenced handle that keeps this process
  // alive, and the tunnel is already serving while registration is still being retried.
  extension.startSentryTunnel();

  try {
    await extension.register();
  } catch (err) {
    logError('could not register, events will not be tunnelled.', err);

    // The one failure worth exiting for. Lambda gates the init phase on every registered extension
    // whatever it subscribed to, so holding a name it cannot poll with holds each invocation to the
    // function timeout; crashing lets Lambda recycle into an environment that works.
    exit(1);
    return;
  }

  const outcome = await extension.run();

  if (outcome.reason === 'shutdown') {
    // The drain has returned, so the rest of Lambda's shutdown window — billed to the function, and
    // otherwise ended by a SIGKILL — is given back.
    exit(0);
    return;
  }

  // The same hazard registration has. Lambda releases the init phase on the first poll the API
  // accepts, so giving up before then leaves this extension holding every invocation to the
  // function timeout — measured at 30,000ms billed per invocation, against 1.5s for a crash that
  // lets Lambda recycle. Once a poll has been accepted the gate is open and staying is free.
  if (!outcome.pollAccepted) {
    logError('never started polling the Extensions API, events will not be tunnelled.', outcome.error);
    exit(1);
    return;
  }

  logError(
    'stopped polling the Extensions API. Envelopes are still tunnelled, but the shutdown drain is lost, ' +
      'so events captured at teardown may not be sent.',
    outcome.error,
  );

  // Deliberately not an exit: a process ending outside the shutdown phase is reported as
  // `Extension.Crash` and fails the invocation in flight. Parked explicitly because a tunnel that
  // failed to listen leaves no handle, and an empty event loop would exit just the same.
  setInterval(() => undefined, MAX_TIMER_DELAY_MS);
}
