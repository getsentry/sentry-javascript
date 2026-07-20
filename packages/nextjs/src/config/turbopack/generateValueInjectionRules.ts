import * as path from 'path';
import type { VercelCronsConfig } from '../../common/types';
import type { RouteManifest } from '../manifest/types';
import type { JSONValue, TurbopackMatcherWithRule } from '../types';
import { getPackageModules, supportsTurbopackRuleCondition } from '../util';

// Marks the bundler (build-time) orchestrion injection as active at boot, without clobbering any
// marker an earlier injector already set. It only creates `__SENTRY_ORCHESTRION__`/`.bundler` if
// absent, so in a hybrid setup the runtime hook's `runtime` list (and any module already recorded by
// the per-module loader prologue) survives. Mirrors the merge-safe pattern of the Bun banner and
// `buildInjectPrologue`. Emitted as a single line so it never shifts the module's source-map mappings.
const ORCHESTRION_BUNDLER_MARKER =
  ';(function(){try{var g=(globalThis.__SENTRY_ORCHESTRION__=globalThis.__SENTRY_ORCHESTRION__||{});g.bundler=g.bundler||[];}catch(e){}})();';

/**
 * Generate the value injection rules for client and server in turbopack config.
 */
export function generateValueInjectionRules({
  routeManifest,
  nextJsVersion,
  tunnelPath,
  vercelCronsConfig,
  injectOrchestrionBundlerMarker,
}: {
  routeManifest?: RouteManifest;
  nextJsVersion?: string;
  tunnelPath?: string;
  vercelCronsConfig?: VercelCronsConfig;
  injectOrchestrionBundlerMarker?: boolean;
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
  serverValues.__SENTRY_SERVER_MODULES__ = getPackageModules(process.cwd());

  if (Object.keys(isomorphicValues).length > 0) {
    clientValues = { ...clientValues, ...isomorphicValues };
    serverValues = { ...serverValues, ...isomorphicValues };
  }

  const hasConditionSupport = nextJsVersion ? supportsTurbopackRuleCondition(nextJsVersion) : false;

  // Client value injection
  if (Object.keys(clientValues).length > 0) {
    rules.push({
      matcher: '**/instrumentation-client.*',
      rule: {
        // Only run on user code, not node_modules or Next.js internals
        // condition field is only supported in Next.js 16+
        ...(hasConditionSupport ? { condition: { not: 'foreign' } } : {}),
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
        // Only run on user code, not node_modules or Next.js internals
        // condition field is only supported in Next.js 16+
        ...(hasConditionSupport ? { condition: { not: 'foreign' } } : {}),
        loaders: [
          {
            loader: path.resolve(__dirname, '..', 'loaders', 'valueInjectionLoader.js'),
            options: {
              values: serverValues,
              // Runs at the top of the server `instrumentation` file — before `Sentry.init()` — so
              // `isOrchestrionInjected()` is reliable for bundler-only setups too. Turbopack has no
              // plugin/boot hook to emit the full transformed-module list the way the webpack plugin
              // does; each transformed module appends itself as it loads (see the orchestrion loader).
              ...(injectOrchestrionBundlerMarker ? { prefixCode: ORCHESTRION_BUNDLER_MARKER } : {}),
            },
          },
        ],
      },
    });
  }

  return rules;
}
