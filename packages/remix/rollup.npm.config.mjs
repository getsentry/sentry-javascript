import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

// `external: /.*/` keeps the `remix` import a runtime resolution against the installed package.
const v3NodeEntry = defineConfig({
  input: 'src/v3/node.mjs',
  external: /.*/,
  output: { format: 'esm', file: 'build/v3-node.mjs' },
});

// We rely on esbuild's defaults for JSX (`jsx: 'transform'` = classic runtime, no
// __self/__source attributes). React 19 prefers the new automatic transform, but switching
// to it would break React 17 support — so we intentionally stay on classic for now.
// https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
export default [
  v3NodeEntry,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/cloudflare/index.ts',
        'src/vite/index.ts',
        'src/v3/index.server.ts',
        'src/v3/index.client.ts',
      ],
      packageSpecificConfig: {
        external: ['react-router', 'react-router-dom', 'react', 'react/jsx-runtime'],
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
          // Without this, Rollup infers a common root from the whole module graph, which here reaches
          // into sibling workspace packages, and the v3 entries land outside `build/esm/v3/`.
          preserveModulesRoot: 'src',
        },
      },
    }),
  ),
  ...makeOrchestrionLoader('./build'),
];
