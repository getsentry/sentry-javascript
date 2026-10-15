import { handleTunnelRequestIfMatched } from '@sentry/core';
import type { NitroAppPlugin, NitroApp } from 'nitro/types';

/**
 * Answers managed tunnel requests on Nuxt v5+ (Nitro v3+).
 */
export default ((nitroApp: NitroApp) => {
  // Nitro runs the app's `server/middleware` before anything a module registers, so an auth middleware there would
  // block the tunnel. Nitro has no public way to go first, but its own generated code wires middleware through
  // this same array.
  nitroApp.h3?.['~middleware'].unshift((event, next) => handleTunnelRequestIfMatched(event.req) ?? next());
}) satisfies NitroAppPlugin;
