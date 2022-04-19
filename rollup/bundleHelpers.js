/**
 * Rollup config docs: https://rollupjs.org/guide/en/#big-list-of-options
 */

import assert from 'assert';

import deepMerge from 'deepmerge';

import {
  makeBrowserBuildPlugin,
  makeIsDebugBuildPlugin,
  makeLicensePlugin,
  makeNodeResolvePlugin,
  makeTerserPlugin,
  makeTSPlugin,
} from './plugins/index.js';
import { getLastElement, insertAt } from './utils.js';

export function makeBaseBundleConfig(options) {
  const { input, isAddOn, jsVersion, licenseTitle, outputFileBase } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const markAsBrowserBuildPlugin = makeBrowserBuildPlugin(true);
  const licensePlugin = makeLicensePlugin(licenseTitle);
  const tsPlugin = makeTSPlugin(jsVersion.toLowerCase());

  // used by `@sentry/browser`, `@sentry/tracing`, and `@sentry/vue` (bundles which are a full SDK in and of themselves)
  const standAloneBundleConfig = {
    output: {
      format: 'iife',
      name: 'Sentry',
    },
    context: 'window',
  };

  // used by `@sentry/integrations` and `@sentry/wasm` (bundles which need to be combined with a stand-alone SDK bundle)
  const addOnBundleConfig = {
    // These output settings are designed to mimic an IIFE. We don't use Rollup's `iife` format because we don't want to
    // attach this code to a new global variable, but rather inject it into the existing SDK's `Integrations` object.
    output: {
      format: 'cjs',

      // code to add before the CJS wrapper
      banner: '(function (__window) {',

      // code to add just inside the CJS wrapper, before any of the wrapped code
      intro: 'var exports = {};',

      // code to add after all of the wrapped code, but still inside the CJS wrapper
      outro: () =>
        [
          '',
          "  // Add this module's exports to the global `Sentry.Integrations`",
          '  __window.Sentry = __window.Sentry || {};',
          '  __window.Sentry.Integrations = __window.Sentry.Integrations || {};',
          '  for (var key in exports) {',
          '    if (Object.prototype.hasOwnProperty.call(exports, key)) {',
          '      __window.Sentry.Integrations[key] = exports[key];',
          '    }',
          '  }',
        ].join('\n'),

      // code to add after the CJS wrapper
      footer: '}(window));',
    },
  };

  // used by all bundles
  const sharedBundleConfig = {
    input,
    output: {
      // a file extension will be added to this base value when we specify either a minified or non-minified build
      file: `build/${outputFileBase}`,
      sourcemap: true,
      strict: false,
      esModule: false,
    },
    plugins: [tsPlugin, markAsBrowserBuildPlugin, nodeResolvePlugin, licensePlugin],
    treeshake: 'smallest',
  };

  return deepMerge(sharedBundleConfig, isAddOn ? addOnBundleConfig : standAloneBundleConfig);
}

/**
 * Takes the CDN rollup config for a given package and produces three versions of it:
 *   - non-minified, including debug logging,
 *   - minified, including debug logging,
 *   - minified, with debug logging stripped
 *
 * @param baseConfig The rollup config shared by the entire package
 * @returns An array of versions of that config
 */
export function makeBundleConfigVariants(baseConfig) {
  const { plugins: baseConfigPlugins } = baseConfig;
  const includeDebuggingPlugin = makeIsDebugBuildPlugin(true);
  const stripDebuggingPlugin = makeIsDebugBuildPlugin(false);
  const terserPlugin = makeTerserPlugin();

  // The license plugin has to be last, so it ends up after terser. Otherwise, terser will remove the license banner.
  assert(
    getLastElement(baseConfigPlugins).name === 'rollup-plugin-license',
    `Last plugin in given options should be \`rollup-plugin-license\`. Found ${getLastElement(baseConfigPlugins).name}`,
  );

  // The additional options to use for each variant we're going to create
  const variantSpecificConfigs = [
    {
      output: {
        file: `${baseConfig.output.file}.js`,
      },
      plugins: insertAt(baseConfigPlugins, -2, includeDebuggingPlugin),
    },
    // This variant isn't particularly helpful for an SDK user, as it strips logging while making no other minification
    // changes, so by default we don't create it. It is however very useful when debugging rollup's treeshaking, so it's
    // left here for that purpose.
    // {
    //   output: { file: `${baseConfig.output.file}.no-debug.js`,
    //   },
    //   plugins: insertAt(plugins, -2, stripDebuggingPlugin),
    // },
    {
      output: {
        file: `${baseConfig.output.file}.min.js`,
      },
      plugins: insertAt(baseConfigPlugins, -2, stripDebuggingPlugin, terserPlugin),
    },
    {
      output: {
        file: `${baseConfig.output.file}.debug.min.js`,
      },
      plugins: insertAt(baseConfigPlugins, -2, includeDebuggingPlugin, terserPlugin),
    },
  ];

  return variantSpecificConfigs.map(variant =>
    deepMerge(baseConfig, variant, {
      // this makes it so that instead of concatenating the `plugin` properties of the two objects, the first value is
      // just overwritten by the second value
      arrayMerge: (first, second) => second,
    }),
  );
}
