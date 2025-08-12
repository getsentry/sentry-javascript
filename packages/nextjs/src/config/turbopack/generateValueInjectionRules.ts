import * as path from 'path';
import type { RouteManifest } from '../manifest/types';
import type { JSONValue, TurbopackMatcherWithRule } from '../types';

/**
 * Generate the value injection rules for client and server in turbopack config.
 */
export function generateValueInjectionRules({
  routeManifest,
  nextJsVersion,
}: {
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
}): TurbopackMatcherWithRule[] {
  const rules: TurbopackMatcherWithRule[] = [];
  const isomorphicValues: Record<string, JSONValue> = {};
  let clientValues: Record<string, JSONValue> = {};
  let serverValues: Record<string, JSONValue> = {};

  if (nextJsVersion) {
    isomorphicValues._sentryNextJsVersion = nextJsVersion;
  }

  if (routeManifest) {
    serverValues._sentryRouteManifest = routeManifest;
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
