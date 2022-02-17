import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';

import { baseBundleConfig, paths, markAsBrowserBuild, terserPlugin } from '../../rollup.config';

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

function mergeIntoSentry() {
  return `
  __window.Sentry = __window.Sentry || {};
  __window.Sentry.Integrations = __window.Sentry.Integrations || {};
  for (var key in exports) {
    if (Object.prototype.hasOwnProperty.call(exports, key)) {
      __window.Sentry.Integrations[key] = exports[key];
    }
  }
  `;
}

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
      input: `src/index.ts`,
      output: {
        banner: '(function (__window) {',
        intro: 'var exports = {};',
        outro: mergeIntoSentry(),
        footer: '}(window));',
        ...baseBundleConfig.output,
        file: `build/wasm${build.extension}`,
        format: 'cjs',
      },
      plugins: build.plugins,
      treeshake: 'smallest',
    });
  });
  return builds;
}

export default loadAllIntegrations();
