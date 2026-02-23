import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: ['src/index.ts', 'src/index.cloudflare.ts'],
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

const defaultExternal = baseConfig.external;
baseConfig.external = id => {
  if (defaultExternal.includes(id)) {
    return true;
  }
  // Mark all hono subpaths as external
  return !!(id === 'hono' || id.startsWith('hono/'));
};

export default [...makeNPMConfigVariants(baseConfig)];
