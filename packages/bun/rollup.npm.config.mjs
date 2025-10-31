import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(makeBaseNPMConfig({
  packageSpecificConfig: {
    output: {
      preserveModules: false
    }
  }
}));
