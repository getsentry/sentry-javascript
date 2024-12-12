import commonjs from '@rollup/plugin-commonjs';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export const ESMImportShim = `
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname } from 'node:path';
`;

const ESMRequireShim = `
const require = createRequire(import.meta.url);
`;

const ESMDirnameShim = `
const __dirname = dirname(fileURLToPath(import.meta.url));
`;

function makeESMImportShimPlugin(shim) {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_IMPORT_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_IMPORT_SHIM/;
      return code.replace(SHIM_REGEXP, shim);
    },
  };
}

function makeESMRequireShimPlugin(shim) {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_REQUIRE_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_REQUIRE_SHIM/;
      return code.replace(SHIM_REGEXP, shim);
    },
  };
}

function makeESMDirnameShimPlugin(shim) {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_DIRNAME_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_DIRNAME_SHIM/;
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
    variant.plugins.push(makeESMRequireShimPlugin(ESMRequireShim));
    variant.plugins.push(makeESMDirnameShimPlugin(ESMDirnameShim));
  } else {
    // Remove the ESM shim comment
    variant.plugins.push(makeESMImportShimPlugin(''));
    variant.plugins.push(makeESMRequireShimPlugin(''));
    variant.plugins.push(makeESMDirnameShimPlugin(''));
  }
}

export default variants;
