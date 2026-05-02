import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: ['src/index.ts', 'src/light/index.ts'],
  packageSpecificConfig: {
    output: {
      exports: 'named',
      preserveModules: true,
    },
  },
});

// Convert the external array to a function so that subpath imports
// (e.g. `@sentry/node-core/light`) are also treated as external.
const externalArray = baseConfig.external || [];
baseConfig.external = id => externalArray.some(dep => id === dep || id.startsWith(`${dep}/`));

export default makeNPMConfigVariants(baseConfig);
