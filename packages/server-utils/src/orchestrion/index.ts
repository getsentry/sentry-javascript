export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
// The runtime target of the snippet the bundler transform splices into every
// instrumented module: records the module on the global marker (plus its
// subscriber factory, when it has one) and emits the module-injected event.
export { orchestrionModuleInjected } from './moduleInjected';
// The `@nestjs/*` channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/nestjs`, which imports this.
export { nestjsChannels } from './config/nestjs';
// The remix channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/remix`, which imports this.
export { remixChannels } from './config/remix';

export type { InstrumentationConfig } from './apmTypes';
