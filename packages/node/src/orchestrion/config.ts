import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

/**
 * The central list of channel injections orchestrion should perform.
 *
 * This module has NO side effects — it's the only thing both the runtime hooks
 * (`runtime/import-hook.mjs`, `runtime/require-hook.cjs`) and the bundler plugins
 * (`bundler/vite.ts`, …) import from. Adding a new instrumented method is one
 * entry here plus one subscriber in `integrations/<lib>/tracing-channel.ts`.
 *
 * `channelName` here is the unprefixed suffix; the actual diagnostics_channel
 * name is `orchestrion:${module.name}:${channelName}` (see `channels.ts`).
 */
export const SENTRY_INSTRUMENTATIONS: InstrumentationConfig[] = [];
