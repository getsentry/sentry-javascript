import { terser } from 'rollup-plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import * as fs from 'fs';

const terserInstance = terser({
  mangle: {
    // captureExceptions and captureMessage are public API methods and they don't need to be listed here
    // as mangler doesn't touch user-facing thing, however sentryWrapepd is not, and it would be mangled into a minified version.
    // We need those full names to correctly detect our internal frames for stripping.
    // I listed all of them here just for the clarity sake, as they are all used in the frames manipulation process.
    reserved: ['captureException', 'captureMessage', 'sentryWrapped'],
    properties: {
      regex: /^_/,
    },
  },
});

const plugins = [
  typescript({
    tsconfig: 'tsconfig.build.json',
    tsconfigOverride: {
      compilerOptions: {
        declaration: false,
        module: 'ES2015',
        paths: {
          '@sentry/utils/*': ['../utils/src/*'],
          '@sentry/core': ['../core/src'],
          '@sentry/hub': ['../hub/src'],
          '@sentry/types': ['../types/src'],
          '@sentry/minimal': ['../minimal/src'],
        },
      },
    },
    include: ['*.ts+(|x)', '**/*.ts+(|x)', '../**/*.ts+(|x)'],
  }),
  resolve({
    browser: true,
    module: false,
    modulesOnly: true,
  }),
  commonjs(),
];

function toPascalCase(string) {
  return `${string}`
    .replace(new RegExp(/[-_]+/, 'g'), ' ')
    .replace(new RegExp(/[^\w\s]/, 'g'), '')
    .replace(new RegExp(/\s+(.)(\w+)/, 'g'), ($1, $2, $3) => `${$2.toUpperCase() + $3.toLowerCase()}`)
    .replace(new RegExp(/\s/, 'g'), '')
    .replace(new RegExp(/\w/), s => s.toUpperCase());
}

function mergeIntoSentry(name) {
  return `window.SentryIntegration = window.SentryIntegration || {}; \n
  window.SentryIntegration.${name} = exports.${name};`;
}

function loadAllIntegrations() {
  return fs.readdirSync('./src').map(file => ({
    input: `src/${file}`,
    output: {
      banner: '(function (window) {',
      intro: 'var exports = {};',
      footer: '}(window));',
      outro: mergeIntoSentry(toPascalCase(file.replace('.ts', ''))),
      file: `build/${file.replace('.ts', '.js')}`,
      format: 'cjs',
      sourcemap: true,
    },
    plugins,
  }));
}

export default loadAllIntegrations();
