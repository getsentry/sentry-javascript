import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

import { terserPlugin } from '../../rollup.config';

const plugins = [
  typescript({
    tsconfig: 'tsconfig.esm.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        declarationMap: false,
        paths: {
          '@sentry/utils': ['../utils/src'],
          '@sentry/core': ['../core/src'],
          '@sentry/hub': ['../hub/src'],
          '@sentry/types': ['../types/src'],
          '@sentry/minimal': ['../minimal/src'],
        },
        baseUrl: '.',
      },
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  }),
  replace({
    // don't replace `__placeholder__` where it's followed immediately by a single `=` (to prevent ending up
    // with something of the form `let "replacementValue" = "some assigned value"`, which would cause a
    // syntax error)
    preventAssignment: true,
    // the replacements to make
    values: {
      __SENTRY_BROWSER_BUNDLE__: true,
    },
  }),
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
        file: `build/wasm${build.extension}`,
        format: 'cjs',
        sourcemap: true,
        strict: false,
        esModule: false,
      },
      plugins: build.plugins,
      treeshake: 'smallest',
    });
  });
  return builds;
}

export default loadAllIntegrations();
