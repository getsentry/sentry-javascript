import type { Package } from '@sentry/types';
import fs from 'fs';
import HtmlWebpackPlugin, { createHtmlTagObject } from 'html-webpack-plugin';
import path from 'path';
import type { Compiler } from 'webpack';

import { addStaticAsset, addStaticAssetSymlink } from './staticAssets';

const LOADER_TEMPLATE = fs.readFileSync(path.join(__dirname, '../fixtures/loader.js'), 'utf-8');
const PACKAGES_DIR = '../../packages';
const PACKAGE_JSON = '../../package.json';

/**
 * Possible values: See BUNDLE_PATHS.browser
 */
const bundleKey = process.env.PW_BUNDLE || '';

// `esm` and `cjs` builds are modules that can be imported / aliased by webpack
const useCompiledModule = bundleKey === 'esm' || bundleKey === 'cjs';

// Bundles need to be injected into HTML before Sentry initialization.
const useBundleOrLoader = bundleKey && !useCompiledModule;
const useLoader = bundleKey.startsWith('loader');

const BUNDLE_PATHS: Record<string, Record<string, string>> = {
  browser: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle_es5: 'build/bundles/bundle.es5.js',
    bundle_es5_min: 'build/bundles/bundle.es5.min.js',
    bundle_es6: 'build/bundles/bundle.js',
    bundle_es6_min: 'build/bundles/bundle.min.js',
    bundle_replay_es6: 'build/bundles/bundle.replay.js',
    bundle_replay_es6_min: 'build/bundles/bundle.replay.min.js',
    bundle_tracing_es5: 'build/bundles/bundle.tracing.es5.js',
    bundle_tracing_es5_min: 'build/bundles/bundle.tracing.es5.min.js',
    bundle_tracing_es6: 'build/bundles/bundle.tracing.js',
    bundle_tracing_es6_min: 'build/bundles/bundle.tracing.min.js',
    bundle_tracing_replay_es6: 'build/bundles/bundle.tracing.replay.js',
    bundle_tracing_replay_es6_min: 'build/bundles/bundle.tracing.replay.min.js',
    loader_base: 'build/bundles/bundle.es5.min.js',
    loader_eager: 'build/bundles/bundle.es5.min.js',
    loader_debug: 'build/bundles/bundle.es5.debug.min.js',
    loader_tracing: 'build/bundles/bundle.tracing.es5.min.js',
    loader_replay: 'build/bundles/bundle.replay.min.js',
    loader_tracing_replay: 'build/bundles/bundle.tracing.replay.debug.min.js',
  },
  integrations: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle_es5: 'build/bundles/[INTEGRATION_NAME].es5.js',
    bundle_es5_min: 'build/bundles/[INTEGRATION_NAME].es5.min.js',
    bundle_es6: 'build/bundles/[INTEGRATION_NAME].js',
    bundle_es6_min: 'build/bundles/[INTEGRATION_NAME].min.js',
  },
  wasm: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle_es6: 'build/bundles/wasm.js',
    bundle_es6_min: 'build/bundles/wasm.min.js',
  },
};

export const LOADER_CONFIGS: Record<string, { options: Record<string, unknown>; lazy: boolean }> = {
  loader_base: {
    options: {},
    lazy: true,
  },
  loader_eager: {
    options: {},
    lazy: false,
  },
  loader_debug: {
    options: { debug: true },
    lazy: true,
  },
  loader_tracing: {
    options: { tracesSampleRate: 1 },
    lazy: false,
  },
  loader_replay: {
    options: { replaysSessionSampleRate: 1, replaysOnErrorSampleRate: 1 },
    lazy: false,
  },
  loader_tracing_replay: {
    options: { tracesSampleRate: 1, replaysSessionSampleRate: 1, replaysOnErrorSampleRate: 1, debug: true },
    lazy: false,
  },
};

/*
 * Generate webpack aliases based on packages in monorepo
 *
 * When using compiled versions of the tracing and browser packages, their aliases look for example like
 *     '@sentry/browser': 'path/to/sentry-javascript/packages/browser/esm/index.js'
 * and all other monorepo packages' aliases look for example like
 *     '@sentry/hub': 'path/to/sentry-javascript/packages/hub'
 *
 * When using bundled versions of the tracing and browser packages, all aliases look for example like
 *     '@sentry/browser': false
 * so that the compiled versions aren't included
 */
function generateSentryAlias(): Record<string, string> {
  const rootPackageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as { workspaces: string[] };
  const packageNames = rootPackageJson.workspaces.map(workspace => workspace.replace('packages/', ''));

  return Object.fromEntries(
    packageNames.map(packageName => {
      const packageJSON: Package = JSON.parse(
        fs.readFileSync(path.resolve(PACKAGES_DIR, packageName, 'package.json'), { encoding: 'utf-8' }).toString(),
      );

      const modulePath = path.resolve(PACKAGES_DIR, packageName);

      if (useCompiledModule && bundleKey && BUNDLE_PATHS[packageName]?.[bundleKey]) {
        const bundlePath = path.resolve(modulePath, BUNDLE_PATHS[packageName][bundleKey]);

        return [packageJSON['name'], bundlePath];
      }

      if (useBundleOrLoader) {
        // If we're injecting a bundle, ignore the webpack imports.
        return [packageJSON['name'], false];
      }

      return [packageJSON['name'], modulePath];
    }),
  );
}

class SentryScenarioGenerationPlugin {
  public requiredIntegrations: string[] = [];
  public requiresWASMIntegration: boolean = false;
  public localOutPath: string;

  private _name: string = 'SentryScenarioGenerationPlugin';

  public constructor(localOutPath: string) {
    this.localOutPath = localOutPath;
  }

  public apply(compiler: Compiler): void {
    compiler.options.resolve.alias = generateSentryAlias();
    compiler.options.externals = useBundleOrLoader
      ? {
          // To help Webpack resolve Sentry modules in `import` statements in cases where they're provided in bundles rather than in `node_modules`
          '@sentry/browser': 'Sentry',
          '@sentry/tracing': 'Sentry',
          '@sentry/replay': 'Sentry',
          '@sentry/integrations': 'Sentry.Integrations',
          '@sentry/wasm': 'Sentry.Integrations',
        }
      : {};

    // Checking if the current scenario has imported `@sentry/tracing` or `@sentry/integrations`.
    compiler.hooks.normalModuleFactory.tap(this._name, factory => {
      factory.hooks.parser.for('javascript/auto').tap(this._name, parser => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        parser.hooks.import.tap(
          this._name,
          (statement: { specifiers: [{ imported?: { name: string }; name?: string }] }, source: string) => {
            // We only want to handle the integrations import if it doesn't come from the @sentry/browser re-export
            // In that case, we just want to leave it alone
            if (
              source === '@sentry/integrations' &&
              statement.specifiers[0].name !== 'PluggableIntegrations' &&
              statement.specifiers[0].imported
            ) {
              this.requiredIntegrations.push(statement.specifiers[0].imported.name.toLowerCase());
            } else if (source === '@sentry/wasm') {
              this.requiresWASMIntegration = true;
            }
          },
        );
      });
    });

    compiler.hooks.compilation.tap(this._name, compilation => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync(this._name, (data, cb) => {
        if (useBundleOrLoader) {
          const bundleName = 'browser';
          const bundlePath = BUNDLE_PATHS[bundleName][bundleKey];

          if (!bundlePath) {
            throw new Error(`Could not find bundle or loader for key ${bundleKey}`);
          }

          const bundleObject = useLoader
            ? createHtmlTagObject('script', {
                src: 'loader.js',
              })
            : createHtmlTagObject('script', {
                src: 'cdn.bundle.js',
              });

          addStaticAssetSymlink(this.localOutPath, path.resolve(PACKAGES_DIR, bundleName, bundlePath), 'cdn.bundle.js');

          if (useLoader) {
            const loaderConfig = LOADER_CONFIGS[bundleKey];

            addStaticAsset(this.localOutPath, 'loader.js', () => {
              return LOADER_TEMPLATE.replace('__LOADER_BUNDLE__', "'/cdn.bundle.js'")
                .replace(
                  '__LOADER_OPTIONS__',
                  JSON.stringify({
                    dsn: 'https://public@dsn.ingest.sentry.io/1337',
                    ...loaderConfig.options,
                  }),
                )
                .replace('__LOADER_LAZY__', loaderConfig.lazy ? 'true' : 'false');
            });
          }

          // Convert e.g. bundle_tracing_es5_min to bundle_es5_min
          const integrationBundleKey = bundleKey
            .replace('loader_', 'bundle_')
            .replace('_replay', '')
            .replace('_tracing', '');

          this.requiredIntegrations.forEach(integration => {
            const fileName = `${integration}.bundle.js`;
            addStaticAssetSymlink(
              this.localOutPath,
              path.resolve(
                PACKAGES_DIR,
                'integrations',
                BUNDLE_PATHS['integrations'][integrationBundleKey].replace('[INTEGRATION_NAME]', integration),
              ),
              fileName,
            );

            const integrationObject = createHtmlTagObject('script', {
              src: fileName,
            });

            data.assetTags.scripts.unshift(integrationObject);
          });

          if (this.requiresWASMIntegration && BUNDLE_PATHS['wasm'][integrationBundleKey]) {
            addStaticAssetSymlink(
              this.localOutPath,
              path.resolve(PACKAGES_DIR, 'wasm', BUNDLE_PATHS['wasm'][integrationBundleKey]),
              'wasm.bundle.js',
            );

            const wasmObject = createHtmlTagObject('script', {
              src: 'wasm.bundle.js',
            });

            data.assetTags.scripts.unshift(wasmObject);
          }

          data.assetTags.scripts.unshift(bundleObject);
        }

        cb(null, data);
      });
    });
  }
}

export default SentryScenarioGenerationPlugin;
