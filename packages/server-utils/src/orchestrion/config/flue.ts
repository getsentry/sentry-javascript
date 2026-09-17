import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';
import { registrationOnly } from './registration-only';

/**
 * Flue publishes no diagnostics channels and needs none: it is instrumented by registering with
 * `instrument()`, not by patching call sites. Transforming the entry is only how the module's
 * integration gets registered at evaluation time, which is what installs it on a bundler-only SDK
 * like `@sentry/cloudflare`.
 */
export const flueConfig = [
  registrationOnly({ name: '@flue/runtime', versionRange: '>=2.0.0', filePath: 'dist/index.mjs' }),
] satisfies InstrumentationConfig[];

export const flueModuleNames = getModuleNames(flueConfig);
