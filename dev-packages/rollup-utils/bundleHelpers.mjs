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
  makeLicensePlugin,
  makeNodeResolvePlugin,
  makeRrwebBuildPlugin,
  makeSetSDKSourcePlugin,
  makeSucrasePlugin,
  makeTerserPlugin,
} from './plugins/index.mjs';
import { mergePlugins } from './utils.mjs';
import { makeProductionReplacePlugin } from './plugins/npmPlugins.mjs';

const BUNDLE_VARIANTS = ['.js', '.min.js', '.debug.min.js'];

export function makeBaseBundleConfig(options) {
  const { bundleType, entrypoints, licenseTitle, outputFileBase, packageSpecificConfig, sucrase } = options;

  const nodeResolvePlugin = makeNodeResolvePlugin();
  const sucrasePlugin = makeSucrasePlugin({}, sucrase);
  const cleanupPlugin = makeCleanupPlugin();
  const markAsBrowserBuildPlugin = makeBrowserBuildPlugin(true);
  const licensePlugin = makeLicensePlugin(licenseTitle);
  const rrwebBuildPlugin = makeRrwebBuildPlugin({
    excludeIframe: false,
    excludeShadowDom: false,
  });
  const productionReplacePlugin = makeProductionReplacePlugin();

  // The `commonjs` plugin is the `esModuleInterop` of the bundling world. When used with `transformMixedEsModules`, it
  // will include all dependencies, imported or required, in the final bundle. (Without it, CJS modules aren't included
  // at all, and without `transformMixedEsModules`, they're only included if they're imported, not if they're required.)
  const commonJSPlugin = makeCommonJSPlugin({ transformMixedEsModules: true });

  // used by `@sentry/browser`
  const standAloneBundleConfig = {
    output: {
      format: 'iife',
      name: 'Sentry',
      intro: () => {
        return 'exports = window.Sentry || {};';
      },
    },
    context: 'window',
    plugins: [rrwebBuildPlugin, markAsBrowserBuildPlugin, licensePlugin],
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
    plugins: [rrwebBuildPlugin, markAsBrowserBuildPlugin, licensePlugin],
  };

  const workerBundleConfig = {
    output: {
      format: 'esm',
    },
    plugins: [commonJSPlugin, makeTerserPlugin(), licensePlugin],
    // Don't bundle any of Node's core modules
    external: builtinModules,
  };

  const awsLambdaExtensionBundleConfig = {
    output: {
      format: 'esm',
    },
    plugins: [commonJSPlugin, makeIsDebugBuildPlugin(true), makeTerserPlugin()],
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
    plugins: [productionReplacePlugin, sucrasePlugin, nodeResolvePlugin, cleanupPlugin],
    treeshake: 'smallest',
  };

  const bundleTypeConfigMap = {
    standalone: standAloneBundleConfig,
    addon: addOnBundleConfig,
    'node-worker': workerBundleConfig,
    'lambda-extension': awsLambdaExtensionBundleConfig,
  };

  return deepMerge.all([sharedBundleConfig, bundleTypeConfigMap[bundleType], packageSpecificConfig || {}], {
    // Plugins have to be in the correct order or everything breaks, so when merging we have to manually re-order them
    customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
  });
}

/**
 * @param {import('rollup').RollupOptions} baseConfig
 * @param {string} variant
 */
function getVariantSpecificBundleConfig(baseConfig, variant) {
  const baseEntryNames = baseConfig.output.entryFileNames;

  switch (variant) {
    case '.js':
      return {
        output: {
          entryFileNames: chunkInfo => `${baseEntryNames(chunkInfo)}.js`,
        },
        plugins: [makeIsDebugBuildPlugin(true), makeSetSDKSourcePlugin('cdn')],
      };
    case '.min.js':
      return {
        output: {
          entryFileNames: chunkInfo => `${baseEntryNames(chunkInfo)}.min.js`,
        },
        plugins: [makeIsDebugBuildPlugin(false), makeSetSDKSourcePlugin('cdn'), makeTerserPlugin()],
      };
    case '.debug.min.js':
      return {
        output: {
          entryFileNames: chunkInfo => `${baseEntryNames(chunkInfo)}.debug.min.js`,
        },
        plugins: [makeIsDebugBuildPlugin(true), makeSetSDKSourcePlugin('cdn'), makeTerserPlugin()],
      };
    default:
      throw new Error(`Unknown bundle variant requested: ${variant}`);
  }
}

/**
 * Takes the CDN rollup config for a given package and produces three versions of it:
 *   - non-minified, including debug logging,
 *   - minified, including debug logging,
 *   - minified, with debug logging stripped
 *
 * Pass `() => makeBaseBundleConfig({ ... })` so each variant gets a fresh base config (new plugin instances). That
 * avoids sharing stateful Rollup plugins when `rollupParallel` runs multiple `rollup()` calls concurrently. Passing a
 * plain config object is supported for backwards compatibility but only shallow-clones plugin shells.
 *
 * @param {(() => import('rollup').RollupOptions) | import('rollup').RollupOptions} getBaseConfigOrConfig
 * @param {{ variants?: string[] }} [options]
 */
export function makeBundleConfigVariants(getBaseConfigOrConfig, options = {}) {
  const { variants = BUNDLE_VARIANTS } = options;
  const resolveBase = typeof getBaseConfigOrConfig === 'function' ? getBaseConfigOrConfig : () => getBaseConfigOrConfig;

  return variants.map(variant => {
    if (!BUNDLE_VARIANTS.includes(variant)) {
      throw new Error(`Unknown bundle variant requested: ${variant}`);
    }
    const baseConfig = resolveBase();
    const merged = deepMerge(baseConfig, getVariantSpecificBundleConfig(baseConfig, variant), {
      // Merge the plugin arrays and make sure the end result is in the correct order. Everything else can use the
      // default merge strategy.
      customMerge: key => (key === 'plugins' ? mergePlugins : undefined),
    });

    return merged;
  });
}
