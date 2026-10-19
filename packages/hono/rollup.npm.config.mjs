import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: [
    'src/index.ts',
    'src/index.cloudflare.ts',
    'src/index.node.ts',
    'src/index.bun.ts',
    'src/index.deno.ts',
    'src/node/bundler-plugin/vite.ts',
    'src/node/bundler-plugin/rollup.ts',
    'src/node/bundler-plugin/webpack.ts',
    'src/node/bundler-plugin/esbuild.ts',
  ],
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

const defaultExternal = baseConfig.external;
baseConfig.external = id => {
  if (defaultExternal(id)) {
    return true;
  }
  // Mark all hono subpaths as external
  return !!(id === 'hono' || id.startsWith('hono/'));
};

export default [...makeNPMConfigVariants(baseConfig)];
