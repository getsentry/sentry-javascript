import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      packageSpecificConfig: {
        output: { dir: 'lib', preserveModules: false },
        plugins: [
          commonjs(),
          replace({
            preventAssignment: false,
            values: {
              __IMPORT_META_URL_REPLACEMENT__: 'import.meta.url',
              __CREATE_REQUIRE__: '',
              __LOAD_MODULE_REPLACEMENT__: 'require',
            },
          }),
        ],
      },
    }),
    { emitEsm: false },
  ),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      packageSpecificConfig: {
        output: { dir: 'lib', preserveModules: false },
        plugins: [
          replace({
            preventAssignment: false,
            values: {
              __IMPORT_META_URL_REPLACEMENT__: 'import.meta.url',
              __CREATE_REQUIRE__: 'const require = createRequire(import.meta.url);',
              __LOAD_MODULE_REPLACEMENT__: 'import', // TODO: this somehow only builds when using "require" (but it's ESM?)
            },
          }),
        ],
      },
    }),
    { emitCjs: false },
  ),
];
