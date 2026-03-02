// @ts-check

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf-8'));

if (!packageJson.version) {
  throw new Error('invariant: package version not found');
}

const packageVersion = packageJson.version;

const baseConfig = makeBaseNPMConfig({
  packageSpecificConfig: {
    output: {
      // set exports to 'named' or 'auto' so that rollup doesn't warn
      exports: 'named',
      // set preserveModules to true because we don't want to bundle everything into one file.
      preserveModules:
        process.env.SENTRY_BUILD_PRESERVE_MODULES === undefined
          ? true
          : Boolean(process.env.SENTRY_BUILD_PRESERVE_MODULES),
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __SENTRY_SDK_VERSION__: JSON.stringify(packageVersion),
        },
      }),
    ],
  },
});

// Extend external to handle effect/* subpath imports
const originalExternal = baseConfig.external || [];
baseConfig.external = id => {
  // Match effect and all effect/* subpaths
  if (id === 'effect' || id.startsWith('effect/')) {
    return true;
  }
  // Fall back to original external array check
  if (Array.isArray(originalExternal)) {
    return originalExternal.includes(id);
  }
  return false;
};

export default makeNPMConfigVariants(baseConfig);
