import type { Client, ClientOptions } from '@sentry/core';
import { consoleSandbox, debug, getClient } from '@sentry/core';
import type { ServerRuntimeOptions } from '@sentry/core/server';
import { DEBUG_BUILD } from '../debug-build';

const DEFAULT_SHUTDOWN_TIMEOUT = 2000;

let isShuttingDown = false;

/**
 * @hidden
 */
export function logAndExitProcess(error: unknown): void {
  // A broken stderr makes the console write below raise EPIPE, re-entering here. Return
  // rather than exit, so the in-flight `client.close()` still flushes the fatal event.
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  });

  const client = getClient<Client<ClientOptions & ServerRuntimeOptions>>();

  if (client === undefined) {
    DEBUG_BUILD && debug.warn('No client was defined, we are exiting the process now.');
    global.process.exit(1);
    return;
  }

  const options = client.getOptions();
  const timeout =
    options?.shutdownTimeout && options.shutdownTimeout > 0 ? options.shutdownTimeout : DEFAULT_SHUTDOWN_TIMEOUT;
  client.close(timeout).then(
    (result: boolean) => {
      if (!result) {
        DEBUG_BUILD && debug.warn('We reached the timeout for emptying the request buffer, still exiting now!');
      }
      global.process.exit(1);
    },
    error => {
      DEBUG_BUILD && debug.error(error);
      global.process.exit(1);
    },
  );
}
