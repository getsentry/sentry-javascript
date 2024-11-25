import commonjs from '@rollup/plugin-commonjs';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export const ESMImportShim = `
import cjsModule from 'node:module';
`;

const ESMRequireShim = `
const require = cjsModule.createRequire(import.meta.url);
`

function makeESMImportShimPlugin(shim) {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_IMPORT_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_IMPORT_SHIM/;
      return code.replace(SHIM_REGEXP, shim);
    },
  };
}

function makeESMRequireShimPlugin(shim){
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_REQUIRE_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_REQUIRE_SHIM/;
      return code.replace(SHIM_REGEXP, shim);
    },
  };
}

const variants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: { dir: 'lib', preserveModules: false },
      plugins: [commonjs()],
    },
  }),
);

for (const variant of variants) {
  if (variant.output.format === 'esm') {
    variant.plugins.push(makeESMImportShimPlugin(ESMImportShim));
    variant.plugins.push(makeESMRequireShimPlugin(ESMRequireShim))
  } else {
    // Remove the ESM shim comment
    variant.plugins.push(makeESMImportShimPlugin(''));
    variant.plugins.push(makeESMRequireShimPlugin(''));
  }
}

export default variants;
