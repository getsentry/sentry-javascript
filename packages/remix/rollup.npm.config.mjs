import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

// We rely on esbuild's defaults for JSX (`jsx: 'transform'` = classic runtime, no
// __self/__source attributes). React 19 prefers the new automatic transform, but switching
// to it would break React 17 support — so we intentionally stay on classic for now.
// https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/cloudflare/index.ts',
      ],
      packageSpecificConfig: {
        external: ['react-router', 'react-router-dom', 'react', 'react/jsx-runtime'],
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
