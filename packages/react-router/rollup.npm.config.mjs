import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// We rely on esbuild's defaults for JSX (`jsx: 'transform'` = classic runtime, no
// __self/__source attributes). React 19 prefers the new automatic transform, but switching
// to it would break React 17 support — so we intentionally stay on classic for now.
// https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/cloudflare/index.ts'],
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
