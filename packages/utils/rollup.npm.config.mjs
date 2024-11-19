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

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
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
  }),
);
