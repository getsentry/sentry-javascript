import type { Scope } from '@sentry/core';
import { closeSession, defineIntegration, endSession, getIsolationScope, startSession } from '@sentry/core';

const INTEGRATION_NAME = 'ProcessSession' as const;

/**
 * Records a Session for the current process to track release health.
 *
 * Once the process starts serving requests that are tracked as request sessions, release health is
 * reported through session aggregates instead, and the process session is discarded.
 */
export const processSessionIntegration = defineIntegration(() => {
  let processIsolationScope: Scope | undefined;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      startSession();
      processIsolationScope = getIsolationScope();

      // Emitted in the case of healthy sessions, error of `mechanism.handled: true` and unhandledrejections because
      // The 'beforeExit' event is not emitted for conditions causing explicit termination,
      // such as calling process.exit() or uncaught exceptions.
      // Ref: https://nodejs.org/api/process.html#process_event_beforeexit
      process.on('beforeExit', () => {
        const session = getIsolationScope().getSession();

        // Only call endSession if a Session exists on the Scope and has not already reached a
        // Terminal Status, because "When a session is moved away from ok it must not be updated
        // anymore." `ok` is the only non-terminal status.
        // Ref: https://develop.sentry.dev/sdk/sessions/
        if (session?.status === 'ok') {
          endSession();
        }
      });
    },
    setup(client) {
      const unsubscribe = client.on('startRequestSession', () => {
        unsubscribe();

        const scope = processIsolationScope;
        const session = scope?.getSession();
        if (!scope || !session) {
          return;
        }

        // A session that was already sent upstream is closed so it does not linger as never-ended.
        if (!session.init && session.status === 'ok') {
          closeSession(session);
          client.captureSession(session);
        }
        scope.setSession();
      });
    },
  };
});
