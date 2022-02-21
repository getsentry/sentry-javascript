import { Package } from '@sentry/types';
import { readdirSync, readFileSync } from 'fs';
import HtmlWebpackPlugin, { createHtmlTagObject } from 'html-webpack-plugin';
import path from 'path';
import { Compiler } from 'webpack';

const PACKAGE_PATH = '../../packages';

const tracingOnly = process.env.PW_TRACING_ONLY === 'true';
const bundleKey = process.env.PW_BUNDLE;

// `esm` and `cjs` builds are modules that can be imported / aliased by webpack
const useCompiledModule = bundleKey === 'esm' || bundleKey === 'cjs';

// Bundles need to be injected into HTML before Sentry initialization.
const useBundle = bundleKey && !useCompiledModule;

const BUNDLE_PATHS: Record<string, Record<string, string>> = {
  browser: {
    cjs: 'dist/index.js',
    esm: 'esm/index.js',
    bundle: 'build/bundle.js',
    bundle_min: 'build/bundle.min.js',
    bundle_es6: 'build/bundle.es6.js',
    bundle_es6_min: 'build/bundle.es6.min.js',
  },
  tracing: {
    cjs: 'dist/index.js',
    esm: 'esm/index.js',
    bundle: 'build/bundle.tracing.js',
    bundle_min: 'build/bundle.tracing.min.js',
    // `tracing` doesn't have an es6 build
    bundle_es6: 'build/bundle.tracing.js',
    bundle_es6_min: 'build/bundle.tracing.min.js',
  },
};

/**
 * Generate webpack aliases based on packages in monorepo
 * Example of an alias: '@sentry/serverless': 'path/to/sentry-javascript/packages/serverless',
 */
function generateSentryAlias(): Record<string, string> {
  const dirents = readdirSync(PACKAGE_PATH, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dir => dir.name);

  return Object.fromEntries(
    dirents.map(d => {
      const packageJSON: Package = JSON.parse(
        readFileSync(path.resolve(PACKAGE_PATH, d, 'package.json'), { encoding: 'utf-8' }).toString(),
      );

      const modulePath = path.resolve(PACKAGE_PATH, d);

      if (useCompiledModule && bundleKey && BUNDLE_PATHS[d]?.[bundleKey]) {
        const bundlePath = path.resolve(modulePath, BUNDLE_PATHS[d][bundleKey]);

        return [packageJSON['name'], bundlePath];
      }

      if (useBundle && bundleKey && BUNDLE_PATHS[d]?.[bundleKey]) {
        // If we're injecting a bundle, ignore the webpack import.
        return [packageJSON['name'], false];
      }

      return [packageJSON['name'], modulePath];
    }),
  );
}

class SentryScenarioGenerationPlugin {
  public requiresTracing: boolean = false;

  private _name: string = 'SentryScenarioGenerationPlugin';

  public apply(compiler: Compiler): void {
    compiler.options.resolve.alias = generateSentryAlias();
    compiler.options.externals =
      useBundle && bundleKey
        ? {
            // To help Webpack resolve Sentry modules in `import` statements in cases where they're provided in bundles rather than in `node_modules`
            '@sentry/browser': 'Sentry',
            '@sentry/tracing': 'Sentry',
          }
        : {};

    // Checking if the current scenario has imported `@sentry/tracing`.
    compiler.hooks.normalModuleFactory.tap(this._name, factory => {
      factory.hooks.parser.for('javascript/auto').tap(this._name, parser => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        parser.hooks.import.tap(this._name, (_statement: unknown, source: string) => {
          if (source === '@sentry/tracing') {
            this.requiresTracing = true;
          }
        });
      });
    });

    compiler.hooks.compilation.tap(this._name, compilation => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tapAsync(this._name, (data, cb) => {
        if (useBundle && bundleKey) {
          const bundleName = tracingOnly || this.requiresTracing ? 'tracing' : 'browser';
          const bundleObject = createHtmlTagObject('script', {
            src: path.resolve(PACKAGE_PATH, bundleName, BUNDLE_PATHS[bundleName][bundleKey]),
          });

          data.assetTags.scripts.unshift(bundleObject);
        }

        cb(null, data);
      });
    });
  }
}

export default SentryScenarioGenerationPlugin;
