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
  return `
  __window.Sentry = __window.Sentry || {};
  __window.Sentry.Integrations = __window.Sentry.Integrations || [];
  __window.Sentry.Integrations['${name}'] = exports.${name};
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
          outro: mergeIntoSentry(toPascalCase(file.replace('.ts', ''))),
          footer: '}(window));',
          file: `build/${file.replace('.ts', build.extension)}`,
          format: 'cjs',
          sourcemap: true,
        },
        plugins: build.plugins,
      })),
    );
  });
  return builds;
}

export default loadAllIntegrations();
