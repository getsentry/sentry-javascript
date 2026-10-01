import type { Client } from './client';
import { getClient, getCurrentScope } from './currentScopes';
import { DEBUG_BUILD } from './debug-build';
import type { ClientOptions } from './types/options';
import { consoleSandbox, debug } from './utils/debug-logger';

/** A class object that can instantiate Client objects. */
export type ClientClass<F extends Client, O extends ClientOptions> = new (options: O) => F;

/**
 * Internal function to create a new SDK client instance. The client is
 * installed and then bound to the current scope.
 *
 * @param clientClass The client class to instantiate.
 * @param options Options to pass to the client.
 */
export function initAndBind<F extends Client, O extends ClientOptions>(
  clientClass: ClientClass<F, O>,
  options: O,
): Client {
  if (options.debug === true) {
    if (DEBUG_BUILD) {
      debug.enable();
    } else {
      // use `console.warn` rather than `debug.warn` since by non-debug bundles have all `debug.x` statements stripped
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.warn('[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.');
      });
    }
  }
  warnIfClientIsActive();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new clientClass(options);
  setCurrentClient(client);
  client.init();
  return client;
}

/**
 * Warns when `init()` runs while a client is still bound. The new client
 * replaces it, but the old client stays alive, so the two can mix state.
 *
 * @hidden
 */
export function warnIfClientIsActive(): void {
  if (getClient()) {
    consoleSandbox(() => {
      // TODO(#24883): Point apps that share a page with another app to the
      // isolated client helper, once that PR settles its name.
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] `Sentry.init()` was called more than once. The new client replaces the active client, but the active client is not closed, so state from both can mix. Call `Sentry.init()` only once, or call `await Sentry.close()` before you call it again.',
      );
    });
  }
}

/**
 * Make the given client the current client.
 */
export function setCurrentClient(client: Client): void {
  getCurrentScope().setClient(client);
}
