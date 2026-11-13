import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // preact is bundled, and `preserveModules` names its files by their pnpm store path
        // (`node_modules/.pnpm/preact@x/...`), so emit them under `vendored/` instead. A single-file
        // build would avoid that, but the CDN bundles that consume it tree-shake it much worse.
        entryFileNames: info => `${info.name.replace(/^.*node_modules\//, 'vendored/')}.js`,
      },
      // The widget's `.tsx` files import `h`/`Fragment` from preact directly and rely on the
      // classic transform, the way the rollup build's esbuild `jsxFactory` override did. Rolldown
      // would otherwise read `jsx: "react-jsx"` from tsconfig, pull in `preact/jsx-runtime` and
      // leave those imports dead.
      transform: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } },
    },
  }),
);
