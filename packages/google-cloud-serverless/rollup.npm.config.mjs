import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // Rolldown bundles `require()` calls, so the user-provided module this lazily requires has to be external.
      packageSpecificConfig: { external: ['@google-cloud/common'] },
    }),
  ),
  ...makeOrchestrionLoader('./build'),
];
