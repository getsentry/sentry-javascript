import commonjs from '@rollup/plugin-commonjs';
import esmshim from '@rollup/plugin-esm-shim';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    addPolyfills: false,
    packageSpecificConfig: {
      output: { dir: 'lib', preserveModules: false },
      plugins: [commonjs(), esmshim()],
    },
  }),
);
