import { endSession as endSessionOnScope } from '@sentry/core/browser';

/**
 * How the session lifecycle currently in effect replaces its session, registered by
 * `browserSessionIntegration`. Rotating is lifecycle-specific (the persisted `'session'` lifecycle
 * has a `sessionStorage` record to keep in sync, the others do not), so the integration owns the
 * implementation and the public API below only triggers it.
 */
let rotateSession: (() => void) | undefined;

/**
 * Registers @param rotate as the way to end the current session and start a new one in its place.
 */
export function setSessionRotator(rotate: () => void): void {
  rotateSession = rotate;
}

/**
 * Ends the current session and immediately starts a new one. Everything the page reports from here
 * on belongs to the new session.
 *
 * There is no gap between the two: a browser tab never stops producing telemetry, so a session that
 * ended without a successor would leave whatever comes next unattributed.
 *
 * Requires `browserSessionIntegration` (enabled by default). Without it there is no session the SDK
 * manages, so this only closes a session that was started manually.
 */
export function endSession(): void {
  if (rotateSession) {
    rotateSession();
    return;
  }

  endSessionOnScope();
}
