import * as path from 'path';
import type { RouteManifest } from '../manifest/types';
import type { JSONValue, NextConfigObject, TurbopackMatcherWithRule } from '../types';

/**
 * Generate the value injection rules for client and server in turbopack config.
 */
export function generateValueInjectionRules({
  routeManifest,
  nextJsVersion,
  tunnelPath,
  userNextConfig,
}: {
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
  tunnelPath?: string;
  userNextConfig?: NextConfigObject;
}): TurbopackMatcherWithRule[] {
  const rules: TurbopackMatcherWithRule[] = [];
  const isomorphicValues: Record<string, JSONValue> = {};
  let clientValues: Record<string, JSONValue> = {};
  let serverValues: Record<string, JSONValue> = {};

  if (nextJsVersion) {
    // This is used to determine version-based dev-symbolication behavior
    isomorphicValues._sentryNextJsVersion = nextJsVersion;
  }

  if (routeManifest) {
    clientValues._sentryRouteManifest = JSON.stringify(routeManifest);
  }

  // Inject Spotlight config from NEXT_PUBLIC_SENTRY_SPOTLIGHT
  // Turbopack is only used in dev mode, so we always inject this
  // We check both userNextConfig.env (from next.config.js) and process.env (from .env files or shell)
  const spotlightValue = userNextConfig?.env?.NEXT_PUBLIC_SENTRY_SPOTLIGHT ?? process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;
  if (spotlightValue) {
    clientValues._sentrySpotlight = spotlightValue;
  }

  // Inject tunnel route path for both client and server
  if (tunnelPath) {
    isomorphicValues._sentryRewritesTunnelPath = tunnelPath;
  }

  if (Object.keys(isomorphicValues).length > 0) {
    clientValues = { ...clientValues, ...isomorphicValues };
    serverValues = { ...serverValues, ...isomorphicValues };
  }

  // Client value injection
  if (Object.keys(clientValues).length > 0) {
    rules.push({
      matcher: '**/instrumentation-client.*',
      rule: {
        loaders: [
          {
            loader: path.resolve(__dirname, '..', 'loaders', 'valueInjectionLoader.js'),
            options: {
              values: clientValues,
            },
          },
        ],
      },
    });
  }

  // Server value injection
  if (Object.keys(serverValues).length > 0) {
    rules.push({
      matcher: '**/instrumentation.*',
      rule: {
        loaders: [
          {
            loader: path.resolve(__dirname, '..', 'loaders', 'valueInjectionLoader.js'),
            options: {
              values: serverValues,
            },
          },
        ],
      },
    });
  }

  return rules;
}
