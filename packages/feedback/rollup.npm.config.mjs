import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // set preserveModules to false because for feedback we actually want
        // to bundle everything into one file.
        preserveModules: false,
      },
      // The widget's `.tsx` files import `h`/`Fragment` from preact directly and rely on the
      // classic transform, the way the rollup build's esbuild `jsxFactory` override did. Rolldown
      // would otherwise read `jsx: "react-jsx"` from tsconfig, pull in `preact/jsx-runtime` and
      // leave those imports dead.
      transform: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } },
    },
  }),
);
