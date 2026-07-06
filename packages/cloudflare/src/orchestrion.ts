// Side-effect registration module for the orchestrion channel-subscriber
// integrations (mysql, pg, …). NOT imported by the SDK itself — the
// `@sentry/cloudflare/vite` plugin injects an import of this module into the
// worker bundle alongside the diagnostics-channel injection it performs.
// `getDefaultIntegrations` then picks the factories up from the global marker,
// so builds without the plugin never contain the integration code (and have no
// channels to subscribe to anyway).
//
// Listed in `package.json#sideEffects` so bundlers keep the bare import.
import { registerChannelIntegrations } from '@sentry/server-utils/orchestrion';

registerChannelIntegrations();
