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
