import { handleTunnelRequestIfMatched } from '@sentry/core';
import { definePlugin } from 'nitro';
import { captureErrorHook } from '../hooks/captureErrorHook';

export default definePlugin(nitroApp => {
  nitroApp.hooks.hook('error', captureErrorHook);

  // Nitro runs the app's `middleware/` before anything a module registers, so an auth middleware there would block
  // the tunnel. Nitro has no public way to go first, but its own generated code wires middleware through this array.
  nitroApp.h3?.['~middleware'].unshift((event, next) => handleTunnelRequestIfMatched(event.req) ?? next());
});
