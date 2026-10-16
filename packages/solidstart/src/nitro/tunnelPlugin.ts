import { Readable } from 'node:stream';
import {
  getClient,
  GLOBAL_OBJ,
  handleTunnelRequestIfMatched,
  isTunnelRequest,
  setManagedTunnelBasePath,
} from '@sentry/core';
import type { NitroAppPlugin } from 'nitropack';
import { TUNNEL_BASE_PATH_GLOBAL } from '../common/tunnel';

/**
 * Answers managed tunnel requests on SolidStart v1 (Nitro v2). The `request` hook runs before the app's middleware
 * and routing. `withSentry` registers it.
 */
export default (nitroApp => {
  // The hook sees the path before Nitro strips `server.baseURL`, so the tunnel is served under it. `init` may run
  // after this plugin, so this is repeated for the first requests after it too.
  const applyBaseURL = (): void =>
    setManagedTunnelBasePath(
      getClient(),
      (GLOBAL_OBJ as { [TUNNEL_BASE_PATH_GLOBAL]?: string })[TUNNEL_BASE_PATH_GLOBAL],
    );
  applyBaseURL();

  nitroApp.hooks.hook('request', async event => {
    applyBaseURL();

    const { req, res } = event.node;
    // Checked on the method and path first, so no other request's body gets wrapped in a web `Request`.
    if (!isTunnelRequest(req)) {
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const tunnelResponse = await handleTunnelRequestIfMatched(
      new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers,
        body: Readable.toWeb(req) as ReadableStream,
        // Required by Node's `fetch` for a streamed body.
        duplex: 'half',
      } as RequestInit),
    );
    if (!tunnelResponse) {
      return;
    }

    // Writing the response marks the event as handled, so Nitro stops here.
    res.statusCode = tunnelResponse.status;
    tunnelResponse.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(Buffer.from(await tunnelResponse.arrayBuffer()));
  });
}) satisfies NitroAppPlugin;
