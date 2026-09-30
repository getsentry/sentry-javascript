import type { InstrumentationConfig } from '../apmTypes';
import { registrationOnly } from './registration-only';

/**
 * Nitro's instrumentation consumes tracing channels that h3, srvx and unstorage publish natively, so
 * no channels are injected: transforming these entry files only registers the Nitro integrations at
 * evaluation time, which is what installs them on a bundler-only SDK like `@sentry/cloudflare`. On
 * `@sentry/node` (and deno/bun) the integrations are registered statically, so this is a no-op there.
 *
 * Two anchors because the registration snippet maps a single integration per module (see
 * `channel-integration-definitions.ts`): `h3` — which loads whenever the server runs — registers the
 * span instrumentation, and `unstorage` — a core Nitro storage dependency — registers the
 * Server-Timing trace-propagation headers. Both are core Nitro dependencies evaluated at startup, so
 * a real Nitro app triggers both. The anchor only triggers registration; each integration then
 * subscribes to all of its own channels, independent of which module loaded it.
 */
export const nitroConfig = [
  registrationOnly({ name: 'h3', versionRange: '>=2.0.0-0', filePath: 'dist/h3.mjs' }),
  registrationOnly({ name: 'unstorage', versionRange: '>=2.0.0-0', filePath: 'dist/index.mjs' }),
] satisfies InstrumentationConfig[];
