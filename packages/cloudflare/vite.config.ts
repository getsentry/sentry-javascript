import { configDefaults, defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

// `wrangler` pulls in `miniflare`'s bundled `undici`, which references the `File`
// global at module load. `File` only exists as a global on Node >=20, so these
// suites throw `ReferenceError: File is not defined` at import time on Node 18.
// The Vite plugin they cover requires Vite 7 (Node >=20.19) to run, so skipping
// them below Node 20 loses no meaningful coverage.
const nodeMajor = Number(process.versions.node.split('.')[0]);
const wranglerDependentTests =
  nodeMajor < 20 ? ['**/test/vite/wranglerConfig.test.ts', '**/test/vite/autoInstrument.test.ts'] : [];

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: [...configDefaults.exclude, ...wranglerDependentTests],
  },
});
