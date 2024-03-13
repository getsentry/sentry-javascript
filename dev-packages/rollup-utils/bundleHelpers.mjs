/**
 * Rollup config docs: https://rollupjs.org/guide/en/#big-list-of-options
 */

import { builtinModules } from 'module';

import deepMerge from 'deepmerge';

import {
  makeBrowserBuildPlugin,
  makeCleanupPlugin,
  makeCommonJSPlugin,
  makeIsDebugBuildPlugin,
  makeJsonPlugin,
  makeLicensePlugin,
  makeNodeResolvePlugin,
  makeRrwebBuildPlugin,
  makeSetSDKSourcePlugin,
  makeSucrasePlugin,
  makeTerserPlugin,
} from './plugins/index.mjs';
import { mergePlugins } from './utils.mjs';

const BUNDLE_VARIANTS = ['.js', '.min.js', '.debug.min.js'];

export function makeBaseBundleConfig(options) {
  const { bundleType, entrypoints, licenseTitle, outputFileBase, packageSpecificConfig, sucrase } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const sucrasePlugin = makeSucrasePlugin(sucrase);
  const cleanupPlugin = makeCleanupPlugin();
  const markAsBrowserBuildPlugin = makeBrowserBuildPlugin(true);
  const licensePlugin = makeLicensePlugin(licenseTitle);
  const rrwebBuildPlugin = makeRrwebBuildPlugin({
    excludeIframe: false,
    excludeShadowDom: false,
  });

  // The `commonjs` plugin is the `esModuleInterop` of the bundling world. When used with `transformMixedEsModules`, it
  // will include all dependencies, imported or required, in the final bundle. (Without it, CJS modules aren't included
  // at all, and without `transformMixedEsModules`, they're only included if they're imported, not if they're required.)
  const commonJSPlugin = makeCommonJSPlugin({ transformMixedEsModules: true });

  const jsonPlugin = makeJsonPlugin();

  // used by `@sentry/browser`
  const standAloneBundleConfig = {
    output: {
      format: 'iife',
      name: 'Sentry',
    },
    context: 'window',
    plugins: [rrwebBuildPlugin, markAsBrowserBuildPlugin],
  };

  // used by `@sentry/wasm` & pluggable integrations from core/browser (bundles which need to be combined with a stand-alone SDK bundle)
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
          '      __window.Sentry[key] = exports[key];',
          '    }',
          '  }',
        ].join('\n'),

      // code to add after the CJS wrapper
      footer: '}(window));',
    },
    plugins: [rrwebBuildPlugin, markAsBrowserBuildPlugin],
  };

  // used by `@sentry/aws-serverless`, when creating the lambda layer
  const nodeBundleConfig = {
    output: {
      format: 'cjs',
    },
    plugins: [jsonPlugin, commonJSPlugin],
    // Don't bundle any of Node's core modules
    external: builtinModules,
  };

  const workerBundleConfig = {
    output: {
      format: 'esm',
    },
    plugins: [commonJSPlugin, makeTerserPlugin()],
    // Don't bundle any of Node's core modules
    external: builtinModules,
  };

  // used by all bundles
  const sharedBundleConfig = {
    input: entrypoints,
    output: {
      // a file extension will be added to this base value when we specify either a minified or non-minified build
      entryFileNames: outputFileBase,
      dir: 'build',
      sourcemap: true,
      strict: false,
      esModule: false,
    },
    plugins: [sucrasePlugin, nodeResolvePlugin, cleanupPlugin, licensePlugin],
    treeshake: 'smallest',
  };

  const bundleTypeConfigMap = {
    standalone: standAloneBundleConfig,
    addon: addOnBundleConfig,
    node: nodeBundleConfig,
    'node-worker': workerBundleConfig,
  };

  return deepMerge.all([sharedBundleConfig, bundleTypeConfigMap[bundleType], packageSpecificConfig || {}], {
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
export function makeBundleConfigVariants(baseConfig, options = {}) {
  const { variants = BUNDLE_VARIANTS } = options;

  const includeDebuggingPlugin = makeIsDebugBuildPlugin(true);
  const stripDebuggingPlugin = makeIsDebugBuildPlugin(false);
  const terserPlugin = makeTerserPlugin();
  const setSdkSourcePlugin = makeSetSDKSourcePlugin('cdn');

  // The additional options to use for each variant we're going to create.
  const variantSpecificConfigMap = {
    '.js': {
      output: {
        entryFileNames: chunkInfo => `${baseConfig.output.entryFileNames(chunkInfo)}.js`,
      },
      plugins: [includeDebuggingPlugin, setSdkSourcePlugin],
    },

    '.min.js': {
      output: {
        entryFileNames: chunkInfo => `${baseConfig.output.entryFileNames(chunkInfo)}.min.js`,
      },
      plugins: [stripDebuggingPlugin, setSdkSourcePlugin, terserPlugin],
    },

    '.debug.min.js': {
      output: {
        entryFileNames: chunkInfo => `${baseConfig.output.entryFileNames(chunkInfo)}.debug.min.js`,
      },
      plugins: [includeDebuggingPlugin, setSdkSourcePlugin, terserPlugin],
    },
  };

  return variants.map(variant => {
    if (!BUNDLE_VARIANTS.includes(variant)) {
      throw new Error(`Unknown bundle variant requested: ${variant}`);
    }
    return deepMerge(baseConfig, variantSpecificConfigMap[variant], {
      // Merge the plugin arrays and make sure the end result is in the correct order. Everything else can use the
      // default merge strategy.
      customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
    });
  });
}
