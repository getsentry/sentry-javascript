import type { InstrumentationConfig } from '../apmTypes';
import { registrationOnly } from './registration-only';

/**
 * Nitro's instrumentation consumes tracing channels that h3, srvx and unstorage publish natively, so
 * no channels are injected: transforming this entry file only registers the Nitro integrations at
 * evaluation time, which is what installs them on a bundler-only SDK like `@sentry/cloudflare`. On
 * `@sentry/node` (and deno/bun) the integrations are registered statically, so this is a no-op there.
 *
 * Anchored on `h3` — the module every HTTP-serving Nitro app loads — which registers BOTH
 * `nitroIntegration` (spans) and `nitroServerTimingIntegration` (trace-propagation headers); see
 * `channel-integration-definitions.ts`. Using the guaranteed HTTP module (rather than, say,
 * `unstorage`) avoids a silent failure to register on a Nitro app that happens not to load that other
 * module. The anchor only triggers registration; each integration then subscribes to all of its own
 * channels, independent of which module loaded it.
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
