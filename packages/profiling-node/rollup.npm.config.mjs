import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

/**
 * Skip resolving dynamic imports of node binaries (effectively marking it as external)
 */
const nodeBinariesLoader = () => ({
  name: 'node-binaries-loader',
  resolveDynamicImport(specifier) {
    if (typeof specifier === 'string' && specifier.includes('sentry_cpu_profiler') && specifier.endsWith('.node')) {
      return false;
    }
    return null; // defer to other resolvers
  },
});

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
          nodeBinariesLoader(),
          commonjs(),
          replace({
            preventAssignment: false,
            values: {
              __IMPORT_META_URL_REPLACEMENT__: 'import.meta.url',
              __LOAD_MODULE_REPLACEMENT__: 'import',
            },
          }),
        ],
      },
    }),
    { emitCjs: false },
  ),
];
