// The async local variables integration attaches its debugger from a worker thread, and nothing
// reports when that is done. Until it has attached, a caught exception is not paused on and the
// frames arrive with no `vars` at all, so a scenario that throws too early sees the integration do
// nothing. Attaching takes around 100ms on an idle machine and over 300ms under load, which the
// fixed 500ms wait these scenarios used was not a safe margin for on a loaded CI runner.
//
// The integration tags the thrown error once it has captured its scope, so throwing a probe and
// looking for that tag is the signal. It is an internal key, so if it ever changes this stops
// resolving early and falls back to the bounded wait below, which is the behavior it replaces.
const LOCAL_VARIABLES_KEY = '__SENTRY_ERROR_LOCAL_VARIABLES__';

// Slow enough to stay well under the integration's 50 exceptions/second rate limit, which would
// otherwise switch it back to capturing uncaught exceptions only.
const POLL_INTERVAL_MS = 25;

async function waitForLocalVariables(timeoutMs = 10_000) {
  const giveUpAt = Date.now() + timeoutMs;

  while (Date.now() < giveUpAt) {
    try {
      throw new Error('local variables readiness probe');
    } catch (e) {
      if (e[LOCAL_VARIABLES_KEY]) {
        return true;
      }
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

module.exports = { waitForLocalVariables };
