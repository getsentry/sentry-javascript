import { GLOBAL_OBJ } from '@sentry/core';
import type { RouteManifest } from '../../config/manifest/types';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: RouteManifest | undefined;
};

export const maybeParameterizeRoute = (route: string): string | undefined => {
  const manifest = globalWithInjectedManifest._sentryRouteManifest;

  if (!manifest) {
    return undefined;
  }

  // Static path: no parameterization needed
  if (manifest.staticRoutes.some(r => r.path === route)) {
    return undefined;
  }

  // Dynamic path: find the route pattern that matches the concrete route
  for (const dynamicRoute of manifest.dynamicRoutes) {
    if (dynamicRoute.regex) {
      try {
        // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor -- regex patterns are from build-time route manifest, not user input
        const regex = new RegExp(dynamicRoute.regex);
        if (regex.test(route)) {
          return dynamicRoute.path;
        }
      } catch (error) {
        // Just skip this route in case of invalid regex
        continue;
      }
    }
  }

  // We should never end up here
  return undefined;
};
