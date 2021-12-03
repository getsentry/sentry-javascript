import * as fs from 'fs';

import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

const terserInstance = terser({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapped is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: false,
  },
});

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
  resolve({
    mainFields: ['module'],
  }),
  commonjs(),
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

function allIntegrations() {
  return fs.readdirSync('./src').filter(file => file != 'index.ts');
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
      plugins: [...plugins, terserInstance],
    },
  ].forEach(build => {
    builds.push(
      ...allIntegrations().map(file => ({
        input: `src/${file}`,
        output: {
          banner: '(function (__window) {',
          intro: 'var exports = {};',
          outro: mergeIntoSentry(),
          footer: '}(window));',
          file: `build/${file.replace('.ts', build.extension)}`,
          format: 'cjs',
          sourcemap: true,
          strict: false,
        },
        plugins: build.plugins,
      })),
    );
  });
  return builds;
}

export default loadAllIntegrations();
