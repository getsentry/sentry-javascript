import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';
import packageJson from './package.json' with { type: 'json' };

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
            SENTRY_SDK_VERSION: JSON.stringify(packageJson.version),
          },
        }),
      ],
    },
  }),
);
