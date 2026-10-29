import { GLOBAL_OBJ } from '@sentry/core';
import { _INTERNAL_setManagedTunnelDefaults as setManagedTunnelDefaults } from '@sentry/core/server';
import type { NitroAppPlugin } from 'nitropack';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';

/**
 * Serves the managed tunnel under the app's base path on SolidStart v1 (Nitro v2). The runtime answers the requests.
 * `withSentry` registers it.
 */
export default (() => {
  // The server bundle's banner sets the global before this plugin runs.
  setManagedTunnelDefaults({
    basePath: (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL],
  });
}) satisfies NitroAppPlugin;
