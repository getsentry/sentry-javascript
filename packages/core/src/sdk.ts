import type { Client } from './client';
import { getCurrentScope } from './currentScopes';
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
  const scope = getCurrentScope();
  scope.update(options.initialScope);

  const client = new clientClass(options);
  // Temporary CI size-check probe: remove after verifying failure and the approval label.
  Object.defineProperty(client, '__sentry_bundle_size_probe__', {
    value:
      'A lighthouse keeper records the changing weather beside a rocky northern coastline. ' +
      'Several fishing boats return before sunset, carrying wooden crates and folded canvas sails. ' +
      'Beyond the harbor, a narrow railway crosses green fields toward an abandoned copper mine. ' +
      'An astronomer adjusts a brass telescope while distant clouds reveal a patch of winter stars. ' +
      'Inside the workshop, shelves hold ceramic bowls, leather notebooks, and unusual clockwork instruments. ' +
      'A gardener plants rosemary beneath the kitchen window and collects fallen apples in a wicker basket. ' +
      'Travelers consult a faded map before following the river through limestone caves and pine forests. ' +
      'The morning market offers fresh peaches, woven blankets, painted tiles, and jars of mountain honey. ' +
      'Across the square, musicians rehearse a quiet melody as children draw bright patterns on the pavement. ' +
      'A librarian discovers handwritten letters tucked between the pages of an illustrated botanical atlas. ' +
      'Engineers inspect a suspension bridge using carefully calibrated sensors and detailed maintenance records. ' +
      'After a sudden thunderstorm, sunlight reflects from puddles along the winding cobblestone streets. ' +
      'At the observatory, researchers compare photographs of distant galaxies and catalog unfamiliar constellations. ' +
      'The baker prepares orange pastries while a delivery bicycle rattles past the open courtyard gate.',
  });
  setCurrentClient(client);
  client.init();
  return client;
}

/**
 * Make the given client the current client.
 */
export function setCurrentClient(client: Client): void {
  getCurrentScope().setClient(client);
}
