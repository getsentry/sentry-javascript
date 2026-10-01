/* eslint-disable import/no-named-as-default */
import nodeResolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';

// `external: /.*/` keeps the `remix` import a runtime resolution against the installed package.
const v3NodeEntry = defineConfig({
  input: 'src/v3/node.mjs',
  external: /.*/,
  output: { format: 'esm', file: 'build/v3-node.mjs' },
});

/**
 * The Remix 3 browser entry, bundled into a single self contained ES module.
 *
 * Remix 3 has no bundler. Its asset server serves one HTTP request per module and never drops dead
 * code, because it only ever looks at one module at a time. The ordinary `preserveModules` output
 * therefore costs an app 255 requests and about 364 KB gzipped of `@sentry/*`; bundled here it is 2
 * requests and 54 KB. Publish time is the only place that reduction can happen.
 *
 * Runs over `build/esm/v3/index.client.js` rather than the TypeScript source, to reuse the transpilation
 * the main config already did. That is why it has to come last in this array.
 *
 * Left unminified and without a source map on purpose. The asset server minifies what it serves and
 * builds its own map chain, so a pre-minified file with its own map would add a second chain for
 * nothing.
 */
const v3ClientBundle = defineConfig({
  input: 'build/esm/v3/index.client.js',
  external: id => id === 'remix' || id.startsWith('@remix-run/'),
  treeshake: { moduleSideEffects: false, propertyReadSideEffects: false },
  plugins: [nodeResolve({ browser: true, exportConditions: ['browser', 'import', 'default'] })],
  // Emitted inside `build/esm/v3/`, not at `build/`: the one import it keeps is the relative path to
  // the channel shim, which only resolves from there.
  output: { file: 'build/esm/v3/client-bundle.js', format: 'esm' },
  onwarn(warning, warn) {
    // `this` is undefined in the bundled output of some dependencies, and the graph has cycles. Both
    // are harmless here and would otherwise bury real warnings.
    if (warning.code === 'THIS_IS_UNDEFINED' || warning.code === 'CIRCULAR_DEPENDENCY') {
      return;
    }
    warn(warning);
  },
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
  v3ClientBundle,
];
