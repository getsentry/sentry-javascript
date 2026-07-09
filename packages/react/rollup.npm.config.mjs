import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

// We rely on esbuild's defaults for JSX (`jsx: 'transform'` = classic runtime, no
// __self/__source attributes). React 19 prefers the new automatic transform, but switching
// to it would break React 17 support — so we intentionally stay on classic for now.
// https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // Separate entrypoints for router/redux integrations so they can be imported
    // via package subpaths without sitting on the main export list (tree-shaking).
    entrypoints: [
      'src/index.ts',
      'src/optional-browser-api.ts',
      'src/tanstackrouter.ts',
      'src/redux.ts',
      'src/reactrouterv3.ts',
      'src/reactrouter.tsx',
      'src/reactrouterv6.tsx',
      'src/reactrouterv7.tsx',
      'src/reactrouter.compat.tsx',
    ],
    packageSpecificConfig: {
      external: ['react', 'react/jsx-runtime'],
    },
  }),
);
