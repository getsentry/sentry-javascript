import type { InstrumentationConfig } from '..';

/**
 * Name of the custom transform (see `bundler/moduleInjectedTransform.ts`) that
 * splices only the module-injected registration snippet — no channel machinery.
 * Prefixed so it can never shadow a built-in operator (`traceSync`,
 * `tracingChannelImport`, ...), which the custom-transforms map overrides by
 * name.
 */
export const MODULE_REGISTRATION_TRANSFORM = 'sentryModuleRegistration';

/**
 * Build a registration-only config for one file of a library whose tracing
 * channels are native (published by the library itself): no channels are
 * injected, but transforming the file registers the module's channel-subscriber
 * integration at evaluation time. `astQuery: 'Program'` matches the file root
 * unconditionally, so no anchor function inside the library needs to exist.
 */
export function registrationOnly(module: {
  name: string;
  versionRange: string;
  filePath: string;
}): InstrumentationConfig {
  return {
    channelName: 'module-registration',
    module,
    astQuery: 'Program',
    transform: MODULE_REGISTRATION_TRANSFORM,
  };
}
