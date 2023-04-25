import * as fs from 'fs';

// We want to distribute the README because it contains the MIT license blurb from Sucrase and Rollup
fs.copyFileSync('src/buildPolyfills/README.md', 'build/cjs/buildPolyfills_README.md');
fs.copyFileSync('src/buildPolyfills/README.md', 'build/esm/buildPolyfills_README.md');

// Because we import our polyfills from `@sentry/utils/cjs/buildPolyfills` and `@sentry/utils/esm/buildPolyfills` rather
// than straight from `@sentry/utils` (so as to avoid having them in the package's public API), when tests run, they'll
// expect to find `cjs` and `esm` at the root level of the repo.
try {
  fs.symlinkSync('build/cjs', 'cjs');
} catch (oO) {
  // if we get here, it's because the symlink already exists, so we're good
}
try {
  fs.symlinkSync('build/esm', 'esm');
} catch (oO) {
  // same as above
}
