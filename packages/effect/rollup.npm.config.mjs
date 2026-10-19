import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: [
    'src/index.server.ts',
    'src/index.client.ts',
    'src/bundler-plugin/vite.ts',
    'src/bundler-plugin/rollup.ts',
    'src/bundler-plugin/webpack.ts',
    'src/bundler-plugin/esbuild.ts',
  ],
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

const defaultExternal = baseConfig.external;
const isDefaultExternal =
  typeof defaultExternal === 'function' ? defaultExternal : id => (defaultExternal || []).includes(id);
baseConfig.external = id => {
  if (isDefaultExternal(id)) {
    return true;
  }

  if (id === 'effect' || id.startsWith('effect/') || id.startsWith('@sentry/')) {
    return true;
  }

  return false;
};

export default makeNPMConfigVariants(baseConfig);
