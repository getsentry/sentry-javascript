import type { OrchestrionInstrumentation } from '@sentry/server-utils/orchestrion';
import { nestjsConfig } from './config';
import { nestjsChannelIntegration } from './subscriber';

export { nestjsChannelIntegration } from './subscriber';

/**
 * The NestJS orchestrion instrumentation descriptor.
 *
 * Inject it into the diagnostics-channel assembly so `@sentry/server-utils`
 * never has to depend on `@sentry/nestjs`:
 * - RUNTIME: `@sentry/nestjs` `init()` (and the `@sentry/nestjs/import`
 *   preload entry) register via `registerOrchestrionInstrumentation`.
 * - BUILD: pass it to the bundler plugin's `instrumentations` option, e.g.
 *   `sentryBunPlugin({ instrumentations: [nestjsOrchestrion] })`.
 */
export const nestjsOrchestrion: OrchestrionInstrumentation = {
  name: 'nestjs',
  configs: nestjsConfig,
  integration: nestjsChannelIntegration,
};
