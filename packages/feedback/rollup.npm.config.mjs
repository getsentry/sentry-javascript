import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // PROVISIONAL, pending a decision on whether the single-file output is load-bearing.
        //
        // This used to be `false` ("for feedback we actually want to bundle everything into one
        // file"). Bundling to one file means the CDN build has to rely on intra-module DCE to strip
        // the lazily-loaded modal/screenshot code and Preact from a module it only needs `core`
        // from, and rolldown does that less aggressively than rollup did: Preact's renderer stayed
        // in, costing ~9 kB in the feedback CDN bundles. Preserving modules lets ordinary
        // module-level tree-shaking handle it instead, which drops Preact entirely.
        preserveModules: true,
      },
      // The widget's `.tsx` files import `h`/`Fragment` from preact directly and rely on the
      // classic transform, the way the rollup build's esbuild `jsxFactory` override did. Rolldown
      // would otherwise read `jsx: "react-jsx"` from tsconfig, pull in `preact/jsx-runtime` and
      // leave those imports dead.
      transform: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } },
    },
  }),
);
