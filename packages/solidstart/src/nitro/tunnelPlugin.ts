import { Readable } from 'node:stream';
import { handleTunnelRequestIfMatched, isTunnelRequest } from '@sentry/core';
import type { NitroAppPlugin } from 'nitropack';

/**
 * Answers managed tunnel requests on SolidStart v1 (Nitro v2). The `request` hook runs before the app's middleware
 * and routing. `withSentry` registers it.
 */
export default (nitroApp => {
  nitroApp.hooks.hook('request', async event => {
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
