import commonjs from '@rollup/plugin-commonjs';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export const ESMShim = `
import cjsUrl from 'node:url';
import cjsPath from 'node:path';
import cjsModule from 'node:module';

if(typeof __filename === 'undefined'){
  globalThis.__filename = cjsUrl.fileURLToPath(import.meta.url);
}

if(typeof __dirname === 'undefined'){
  globalThis.__dirname = cjsPath.dirname(__filename);
}

if(typeof require === 'undefined'){
  globalThis.require = cjsModule.createRequire(import.meta.url);
}
`;

function makeESMShimPlugin(shim) {
  return {
    transform(code) {
      const SHIM_REGEXP = /\/\/ #START_SENTRY_ESM_SHIM[\s\S]*?\/\/ #END_SENTRY_ESM_SHIM/;
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
    variant.plugins.push(makeESMShimPlugin(ESMShim));
  } else {
    // Remove the ESM shim comment
    variant.plugins.push(makeESMShimPlugin(''));
  }
}

export default variants;
