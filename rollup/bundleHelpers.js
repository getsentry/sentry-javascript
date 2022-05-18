/**
 * Rollup config docs: https://rollupjs.org/guide/en/#big-list-of-options
 */

import { builtinModules } from 'module';

import deepMerge from 'deepmerge';

import {
  makeBrowserBuildPlugin,
  makeCommonJSPlugin,
  makeIsDebugBuildPlugin,
  makeLicensePlugin,
  makeNodeResolvePlugin,
  makeRemoveBlankLinesPlugin,
  makeRemoveESLintCommentsPlugin,
  makeSucrasePlugin,
  makeTerserPlugin,
  makeTSPlugin,
} from './plugins/index.js';
import { mergePlugins } from './utils';

export function makeBaseBundleConfig(options) {
  const { bundleType, input, jsVersion, licenseTitle, outputFileBase } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const sucrasePlugin = makeSucrasePlugin();
  const removeBlankLinesPlugin = makeRemoveBlankLinesPlugin();
  const removeESLintCommentsPlugin = makeRemoveESLintCommentsPlugin();
  const markAsBrowserBuildPlugin = makeBrowserBuildPlugin(true);
  const licensePlugin = makeLicensePlugin(licenseTitle);
  const tsPlugin = makeTSPlugin(jsVersion.toLowerCase());

  // The `commonjs` plugin is the `esModuleInterop` of the bundling world. When used with `transformMixedEsModules`, it
  // will include all dependencies, imported or required, in the final bundle. (Without it, CJS modules aren't included
  // at all, and without `transformMixedEsModules`, they're only included if they're imported, not if they're required.)
  const commonJSPlugin = makeCommonJSPlugin({ transformMixedEsModules: true });

  // used by `@sentry/browser`, `@sentry/tracing`, and `@sentry/vue` (bundles which are a full SDK in and of themselves)
  const standAloneBundleConfig = {
    output: {
      format: 'iife',
      name: 'Sentry',
    },
    context: 'window',
    plugins: [markAsBrowserBuildPlugin],
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
    plugins: [markAsBrowserBuildPlugin],
  };

  // used by `@sentry/serverless`, when creating the lambda layer
  const nodeBundleConfig = {
    output: {
      format: 'cjs',
    },
    plugins: [commonJSPlugin],
    // Don't bundle any of Node's core modules
    external: builtinModules,
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
    plugins:
      jsVersion === 'es5'
        ? [tsPlugin, nodeResolvePlugin, licensePlugin]
        : [sucrasePlugin, removeBlankLinesPlugin, removeESLintCommentsPlugin, nodeResolvePlugin, licensePlugin],
    treeshake: 'smallest',
  };

  const bundleTypeConfigMap = {
    standalone: standAloneBundleConfig,
    addon: addOnBundleConfig,
    node: nodeBundleConfig,
  };

  return deepMerge(sharedBundleConfig, bundleTypeConfigMap[bundleType], {
    // Plugins have to be in the correct order or everything breaks, so when merging we have to manually re-order them
    customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
  });
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
  const includeDebuggingPlugin = makeIsDebugBuildPlugin(true);
  const stripDebuggingPlugin = makeIsDebugBuildPlugin(false);
  const terserPlugin = makeTerserPlugin();

  // The additional options to use for each variant we're going to create
  const variantSpecificConfigs = [
    {
      output: {
        file: `${baseConfig.output.file}.js`,
      },
      plugins: [includeDebuggingPlugin],
    },
    // This variant isn't particularly helpful for an SDK user, as it strips logging while making no other minification
    // changes, so by default we don't create it. It is however very useful when debugging rollup's treeshaking, so it's
    // left here for that purpose.
    // {
    //   output: { file: `${baseConfig.output.file}.no-debug.js`,
    //   },
    //   plugins: [stripDebuggingPlugin],
    // },
    {
      output: {
        file: `${baseConfig.output.file}.min.js`,
      },
      plugins: [stripDebuggingPlugin, terserPlugin],
    },
    {
      output: {
        file: `${baseConfig.output.file}.debug.min.js`,
      },
      plugins: [terserPlugin],
    },
  ];

  return variantSpecificConfigs.map(variant =>
    deepMerge(baseConfig, variant, {
      // Merge the plugin arrays and make sure the end result is in the correct order. Everything else can use the
      // default merge strategy.
      customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
    }),
  );
}
