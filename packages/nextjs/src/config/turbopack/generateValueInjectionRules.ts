import * as path from 'path';
import type { RouteManifest } from '../manifest/types';
import type { JSONValue, TurbopackMatcherWithRule } from '../types';

/**
 * Generate the value injection rules for client and server in turbopack config.
 */
export function generateValueInjectionRules({
  routeManifest,
  nextJsVersion,
  tunnelPath,
  spotlightConfig,
}: {
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
  tunnelPath?: string;
  spotlightConfig?: string;
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

  // Inject tunnel route path for both client and server
  if (tunnelPath) {
    isomorphicValues._sentryRewritesTunnelPath = tunnelPath;
  }

  // Inject Spotlight config for client so the browser SDK can auto-enable Spotlight.
  // Next.js doesn't expose NEXT_PUBLIC_* vars to node_modules, so we inject it via
  // globalThis. The browser SDK's getEnvValue() checks globalThis as a fallback.
  // We also inject _sentrySpotlight as a fallback for the Next.js SDK's client/index.ts.
  if (spotlightConfig) {
    clientValues.NEXT_PUBLIC_SENTRY_SPOTLIGHT = spotlightConfig;
    clientValues._sentrySpotlight = spotlightConfig;
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
