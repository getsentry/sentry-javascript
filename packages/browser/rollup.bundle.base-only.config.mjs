import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.ts'],
  licenseTitle: '@sentry/browser',
  outputFileBase: () => 'bundles/bundle',
});

// Only build .min.js variant for speed
const variants = makeBundleConfigVariants(baseBundleConfig);
export default variants.filter(v => {
  const o = Array.isArray(v.output) ? v.output[0] : v.output;
  const name = typeof o.entryFileNames === 'function' ? o.entryFileNames({name:'x'}) : o.entryFileNames;
  return name === 'bundles/bundle.min.js';
});
