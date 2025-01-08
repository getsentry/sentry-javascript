import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: { dir: 'lib', preserveModules: false },
      plugins: [
        commonjs(),
        replace({
          preventAssignment: false,
          values: {
            __IMPORT_META_URL_REPLACEMENT__: 'import.meta.url',
          },
        }),
      ],
    },
  }),
);
