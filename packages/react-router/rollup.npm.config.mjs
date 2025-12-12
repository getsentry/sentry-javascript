import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/index.types.ts', 'src/cloudflare/index.ts'],
      packageSpecificConfig: {
        external: ['react-router', 'react-router-dom', 'react', 'react/jsx-runtime', 'vite'],
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
      },
    }),
  ),
];
