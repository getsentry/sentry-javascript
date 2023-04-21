import type { Package } from '@sentry/types';
import fs from 'fs';
import HtmlWebpackPlugin, { createHtmlTagObject } from 'html-webpack-plugin';
import path from 'path';
import type { Compiler } from 'webpack';

const PACKAGES_DIR = '../../packages';

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
function generateSentryAlias(
  useCompiledModule: boolean,
  useBundleOrLoader: boolean,
  bundle: string,
): Record<string, string> {
  const packageNames = fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .filter(dir => !['apm', 'minimal', 'next-plugin-sentry'].includes(dir.name))
    .map(dir => dir.name);

  return Object.fromEntries(
    packageNames.map(packageName => {
      const packageJSON: Package = JSON.parse(
        fs.readFileSync(path.resolve(PACKAGES_DIR, packageName, 'package.json'), { encoding: 'utf-8' }).toString(),
      );

      const modulePath = path.resolve(PACKAGES_DIR, packageName);

      if (useCompiledModule && bundle && BUNDLE_PATHS[packageName]?.[bundle]) {
        const bundlePath = path.resolve(modulePath, BUNDLE_PATHS[packageName][bundle]);

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

  private _name: string = 'SentryScenarioGenerationPlugin';

  public constructor(private readonly bundle: string) {}

  public apply(compiler: Compiler): void {
    // `esm` and `cjs` builds are modules that can be imported / aliased by webpack
    const useCompiledModule = this.bundle === 'esm' || this.bundle === 'cjs';

    // Bundles need to be injected into HTML before Sentry initialization.
    const useBundleOrLoader = !useCompiledModule;
    const useLoader = this.bundle.startsWith('loader');

    compiler.options.resolve.alias = generateSentryAlias(useCompiledModule, useBundleOrLoader, this.bundle);
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
          (statement: { specifiers: [{ imported: { name: string } }] }, source: string) => {
            if (source === '@sentry/integrations') {
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
          const bundlePath = BUNDLE_PATHS[bundleName][this.bundle];

          let bundleObject =
            bundlePath &&
            createHtmlTagObject('script', {
              src: path.resolve(PACKAGES_DIR, bundleName, bundlePath),
            });

          if (!bundleObject && useLoader) {
            bundleObject = createHtmlTagObject('script', {
              src: 'loader.js',
            });
          }

          if (!bundleObject) {
            throw new Error(`Could not find bundle or loader for key ${this.bundle}`);
          }

          // Convert e.g. bundle_tracing_es5_min to bundle_es5_min
          const integrationBundleKey = this.bundle
            .replace('loader_', 'bundle_')
            .replace('_replay', '')
            .replace('_tracing', '');

          this.requiredIntegrations.forEach(integration => {
            const integrationObject = createHtmlTagObject('script', {
              src: path.resolve(
                PACKAGES_DIR,
                'integrations',
                BUNDLE_PATHS['integrations'][integrationBundleKey].replace('[INTEGRATION_NAME]', integration),
              ),
            });

            data.assetTags.scripts.unshift(integrationObject);
          });

          if (this.requiresWASMIntegration && BUNDLE_PATHS['wasm'][integrationBundleKey]) {
            const wasmObject = createHtmlTagObject('script', {
              src: path.resolve(PACKAGES_DIR, 'wasm', BUNDLE_PATHS['wasm'][integrationBundleKey]),
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
