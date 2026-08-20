export { detectOrchestrionSetup, isOrchestrionInjected } from './detect';
// The `@nestjs/*` channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/nestjs`, which imports this.
export { nestjsChannels } from './config/nestjs';
// The remix channel names live here alongside their transform config; the
// listener that subscribes to them lives in `@sentry/remix`, which imports this.
export { remixChannels } from './config/remix';

export type { InstrumentationConfig } from './apmTypes';
