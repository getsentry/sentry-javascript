import type { InstrumentationConfig } from '../apmTypes';
import { registrationOnly } from './registration-only';

const H3_VERSION_RANGE = '>=2.0.0-0';

/**
 * Nitro's instrumentation mostly consumes tracing channels that h3, srvx and unstorage publish
 * natively, which Nitro only enables with its `tracingChannel` option. The h3 entry file gets no
 * channels: transforming it only registers `nitroIntegration` at evaluation time, which is what
 * installs it on a bundler-only SDK like `@sentry/cloudflare`. On `@sentry/node` (and deno/bun) the
 * integration is registered statically, so that is a no-op there. The other targets inject channels
 * into h3 internals, so the integration works without `tracingChannel`.
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
  registrationOnly({ name: 'h3', versionRange: H3_VERSION_RANGE, filePath: 'dist/h3.mjs' }),
  {
    // Runs for every response, after h3 has matched the route. A build chunk, not API, so an h3 release
    // can move it. It calls itself again (with `nested`) on the error path.
    channelName: 'prepareResponse',
    module: { name: 'h3', versionRange: H3_VERSION_RANGE, filePath: 'dist/response.mjs' },
    functionQuery: { functionName: 'prepareResponse', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const nitroChannels = {
  H3_PREPARE_RESPONSE: 'orchestrion:h3:prepareResponse',
} as const;
