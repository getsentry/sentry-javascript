import type { InstrumentationConfig } from '../apmTypes';
import { registrationOnly } from './registration-only';

/**
 * Nitro's instrumentation consumes tracing channels that h3, srvx and unstorage publish natively, so
 * no channels are injected: transforming h3's entry file only registers `nitroIntegration` at
 * evaluation time, which is what installs it on a bundler-only SDK like `@sentry/cloudflare`. On
 * `@sentry/node` (and deno/bun) the integration is registered statically, so this is a no-op there.
 *
 * Anchored on `h3` because every HTTP-serving Nitro app loads it. The anchor only triggers
 * registration; the integration then subscribes to all of its channels (including unstorage's),
 * independent of which module loaded it.
 *
 * The `-0` in the version range matters: h3 ships the version Nitro 3 uses as a prerelease
 * (`2.0.1-rc.*`). The orchestrion matcher is the vendored `semifies` (used by both the runtime loader
 * and the bundler plugins), where a range carrying a prerelease tag enables prerelease matching
 * across patch tuples — so `>=2.0.0-0` matches `2.0.1-rc.*`. (Plain node-semver would not: it drops
 * prereleases of a higher patch tuple.)
 */
export const nitroConfig = [
  registrationOnly({ name: 'h3', versionRange: '>=2.0.0-0', filePath: 'dist/h3.mjs' }),
] satisfies InstrumentationConfig[];

const NITRO_VERSION_RANGE = '>=3.0.0-0';
const H3_VERSION_RANGE = '>=2.0.0-0';

/**
 * Nitro and h3 internals that orchestrion can inject channels into. Not part of `nitroConfig` (and so
 * not injected into user builds) yet: the `nitro-3-orchestrion` e2e app passes these to the bundler
 * plugins to check that every target still exists in the latest Nitro and h3. Each target moves into
 * `nitroConfig` once an integration subscribes to it.
 *
 * The h3 file paths are build chunks, not API, so an h3 release can move them.
 */
export const nitroRuntimeConfig: InstrumentationConfig[] = [
  {
    // Memoized, but called on every request. Its `end` event carries the Nitro app as `result`.
    channelName: 'useNitroApp',
    module: { name: 'nitro', versionRange: NITRO_VERSION_RANGE, filePath: 'dist/runtime/internal/app.mjs' },
    functionQuery: { functionName: 'useNitroApp', kind: 'Sync' },
  },
  {
    channelName: 'runTask',
    module: { name: 'nitro', versionRange: NITRO_VERSION_RANGE, filePath: 'dist/runtime/internal/task.mjs' },
    functionQuery: { functionName: 'runTask', kind: 'Async' },
  },
  {
    // Runs on the main thread of the dev server, which loads Nitro from `node_modules` unbundled, so
    // only the runtime hook can instrument it.
    channelName: 'nitroDevAppConstructor',
    module: { name: 'nitro', versionRange: NITRO_VERSION_RANGE, filePath: 'dist/_dev.mjs' },
    functionQuery: { className: 'NitroDevApp' },
  },
  {
    // Sync, but returns a Promise when the error path calls `onError`, which then calls it again.
    channelName: 'prepareResponse',
    module: { name: 'h3', versionRange: H3_VERSION_RANGE, filePath: 'dist/response.mjs' },
    functionQuery: { functionName: 'prepareResponse', kind: 'Sync' },
  },
  {
    // Sets `context.matchedRoute`, then dispatches to the middleware and the route handler.
    channelName: 'h3CoreHandler',
    module: { name: 'h3', versionRange: H3_VERSION_RANGE, filePath: 'dist/cache.mjs' },
    functionQuery: { className: 'H3Core', methodName: 'handler', kind: 'Sync' },
  },
  {
    // Runs once per middleware layer. Returns the layer's result, or a Promise of it.
    channelName: 'callLayer',
    module: { name: 'h3', versionRange: H3_VERSION_RANGE, filePath: 'dist/middleware.mjs' },
    functionQuery: { functionName: 'callLayer', kind: 'Sync' },
  },
];

export const nitroChannels = {
  NITRO_USE_NITRO_APP: 'orchestrion:nitro:useNitroApp',
  NITRO_RUN_TASK: 'orchestrion:nitro:runTask',
  NITRO_DEV_APP: 'orchestrion:nitro:nitroDevAppConstructor',
  H3_PREPARE_RESPONSE: 'orchestrion:h3:prepareResponse',
  H3_CORE_HANDLER: 'orchestrion:h3:h3CoreHandler',
  H3_CALL_LAYER: 'orchestrion:h3:callLayer',
} as const;
