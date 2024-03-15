import commonjs from '@rollup/plugin-commonjs';
import esmshim from '@rollup/plugin-esm-shim';
// import typescript from '@rollup/plugin-typescript';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: { dir: 'lib', preserveModules: false },
      plugins: [commonjs(), esmshim()],
    },
  }),
);
