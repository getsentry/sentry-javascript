import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';

import { addOnBundleConfig, baseBundleConfig, paths, markAsBrowserBuild, terserPlugin } from '../../rollup.config';

const plugins = [
  typescript({
    tsconfig: 'tsconfig.esm.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        paths,
        baseUrl: '.',
      },
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  }),
  // replace `__SENTRY_BROWSER_BUNDLE__` with `true` to enable treeshaking of non-browser code
  markAsBrowserBuild,
  resolve({
    mainFields: ['module'],
  }),
];

function loadAllIntegrations() {
  const builds = [];
  [
    {
      extension: '.js',
      plugins,
    },
    {
      extension: '.min.js',
      plugins: [...plugins, terserPlugin],
    },
  ].forEach(build => {
    builds.push({
      ...baseBundleConfig,
      input: `src/index.ts`,
      output: {
        ...baseBundleConfig.output,
        ...addOnBundleConfig.output,
        file: `build/wasm${build.extension}`,
      },
      plugins: build.plugins,
    });
  });
  return builds;
}

export default loadAllIntegrations();
