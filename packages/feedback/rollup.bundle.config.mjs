import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

// The widget's `.tsx` files import `h`/`Fragment` from preact directly and rely on the classic
// transform, the way the rollup build's esbuild `jsxFactory` override did. Rolldown would otherwise
// read `jsx: "react-jsx"` from tsconfig and pull in `preact/jsx-runtime`.
const preactJsx = {
  transform: { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } },
};

export default [
  // The core `feedback` bundle is built in the browser package
  // Sub-bundles are built here
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/screenshot/integration.ts'],
      jsVersion: 'es6',
      licenseTitle: '@sentry/feedback',
      outputFileBase: () => 'bundles/feedback-screenshot',
      packageSpecificConfig: preactJsx,
    }),
  ),
  ...makeBundleConfigVariants(
    makeBaseBundleConfig({
      bundleType: 'addon',
      entrypoints: ['src/modal/integration.tsx'],
      jsVersion: 'es6',
      licenseTitle: '@sentry/feedback',
      outputFileBase: () => 'bundles/feedback-modal',
      packageSpecificConfig: preactJsx,
    }),
  ),
];
