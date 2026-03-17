import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: ['src/index.server.ts', 'src/index.client.ts'],
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

const defaultExternal = baseConfig.external || [];
baseConfig.external = id => {
  if (defaultExternal.includes(id)) {
    return true;
  }

  if (id === 'effect' || id.startsWith('effect/') || id.startsWith('@sentry/')) {
    return true;
  }

  return false;
};

export default makeNPMConfigVariants(baseConfig);
