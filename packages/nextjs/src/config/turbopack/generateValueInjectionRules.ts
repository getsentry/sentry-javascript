import * as path from 'path';
import type { VercelCronsConfig } from '../../common/types';
import type { RouteManifest } from '../manifest/types';
import type { JSONValue, TurbopackMatcherWithRule } from '../types';
import { _getModules } from '../util';

/**
 * Generate the value injection rules for client and server in turbopack config.
 */
export function generateValueInjectionRules({
  routeManifest,
  nextJsVersion,
  tunnelPath,
  vercelCronsConfig,
}: {
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
  tunnelPath?: string;
  vercelCronsConfig?: VercelCronsConfig;
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

  // Inject Vercel crons config for server-side cron auto-instrumentation
  if (vercelCronsConfig) {
    serverValues._sentryVercelCronsConfig = JSON.stringify(vercelCronsConfig);
  }
  // Inject server modules (matching webpack's __SENTRY_SERVER_MODULES__ behavior)
  // Use process.cwd() to get the project directory at build time
  serverValues.__SENTRY_SERVER_MODULES__ = _getModules(process.cwd());

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
