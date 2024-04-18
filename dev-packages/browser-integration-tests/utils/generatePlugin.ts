import fs from 'fs';
import path from 'path';
import type { Package } from '@sentry/types';
import HtmlWebpackPlugin, { createHtmlTagObject } from 'html-webpack-plugin';
import type { Compiler } from 'webpack';

import { addStaticAsset, addStaticAssetSymlink } from './staticAssets';

const LOADER_TEMPLATE = fs.readFileSync(path.join(__dirname, '../fixtures/loader.js'), 'utf-8');
const PACKAGES_DIR = path.join(__dirname, '..', '..', '..', 'packages');
const ROOT_PACKAGE_JSON_PATH = path.join(__dirname, '..', '..', '..', 'package.json');

/**
 * Possible values: See BUNDLE_PATHS.browser
 */
const bundleKey = process.env.PW_BUNDLE || '';

// `esm` and `cjs` builds are modules that can be imported / aliased by webpack
const useCompiledModule = bundleKey === 'esm' || bundleKey === 'cjs';

// Bundles need to be injected into HTML before Sentry initialization.
const useBundleOrLoader = bundleKey && !useCompiledModule;
const useLoader = bundleKey.startsWith('loader');

// These are imports that, when using CDN bundles, are not included in the main CDN bundle.
// In this case, if we encounter this import, we want to add this CDN bundle file instead
const IMPORTED_INTEGRATION_CDN_BUNDLE_PATHS: Record<string, string> = {
  httpClientIntegration: 'httpclient',
  captureConsoleIntegration: 'captureconsole',
  CaptureConsole: 'captureconsole',
  debugIntegration: 'debug',
  rewriteFramesIntegration: 'rewriteframes',
  contextLinesIntegration: 'contextlines',
  extraErrorDataIntegration: 'extraerrordata',
  reportingObserverIntegration: 'reportingobserver',
  sessionTimingIntegration: 'sessiontiming',
};

const BUNDLE_PATHS: Record<string, Record<string, string>> = {
  browser: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle: 'build/bundles/bundle.js',
    bundle_min: 'build/bundles/bundle.min.js',
    bundle_replay: 'build/bundles/bundle.replay.js',
    bundle_replay_min: 'build/bundles/bundle.replay.min.js',
    bundle_tracing: 'build/bundles/bundle.tracing.js',
    bundle_tracing_min: 'build/bundles/bundle.tracing.min.js',
    bundle_tracing_replay: 'build/bundles/bundle.tracing.replay.js',
    bundle_tracing_replay_min: 'build/bundles/bundle.tracing.replay.min.js',
    bundle_tracing_replay_feedback: 'build/bundles/bundle.tracing.replay.feedback.js',
    bundle_tracing_replay_feedback_min: 'build/bundles/bundle.tracing.replay.feedback.min.js',
    loader_base: 'build/bundles/bundle.min.js',
    loader_eager: 'build/bundles/bundle.min.js',
    loader_debug: 'build/bundles/bundle.debug.min.js',
    loader_tracing: 'build/bundles/bundle.tracing.min.js',
    loader_replay: 'build/bundles/bundle.replay.min.js',
    loader_tracing_replay: 'build/bundles/bundle.tracing.replay.debug.min.js',
  },
  integrations: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle: 'build/bundles/[INTEGRATION_NAME].js',
    bundle_min: 'build/bundles/[INTEGRATION_NAME].min.js',
  },
  wasm: {
    cjs: 'build/npm/cjs/index.js',
    esm: 'build/npm/esm/index.js',
    bundle: 'build/bundles/wasm.js',
    bundle_min: 'build/bundles/wasm.min.js',
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
 *     '@sentry/react': 'path/to/sentry-javascript/packages/react'
 *
 * When using bundled versions of the tracing and browser packages, all aliases look for example like
 *     '@sentry/browser': false
 * so that the compiled versions aren't included
 */
function generateSentryAlias(): Record<string, string> {
  const rootPackageJson = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON_PATH, 'utf8')) as { workspaces: string[] };
  const packageNames = rootPackageJson.workspaces
    .filter(workspace => !workspace.startsWith('dev-packages/'))
    .map(workspace => workspace.replace('packages/', ''));

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
          '@sentry-internal/replay': 'Sentry',
          '@sentry/wasm': 'Sentry',
        }
      : {};

    // Checking if the current scenario has imported `@sentry/integrations`.
    compiler.hooks.normalModuleFactory.tap(this._name, factory => {
      factory.hooks.parser.for('javascript/auto').tap(this._name, parser => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        parser.hooks.import.tap(
          this._name,
          (statement: { specifiers: [{ imported: { name: string } }] }, source: string) => {
            const imported = statement.specifiers?.[0]?.imported?.name;

            if (imported && IMPORTED_INTEGRATION_CDN_BUNDLE_PATHS[imported]) {
              const bundleName = IMPORTED_INTEGRATION_CDN_BUNDLE_PATHS[imported];
              this.requiredIntegrations.push(bundleName);
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

          // Convert e.g. bundle_tracing_min to bundle_min
          const integrationBundleKey = bundleKey
            .replace('loader_', 'bundle_')
            .replace('_replay', '')
            .replace('_tracing', '')
            .replace('_feedback', '');

          this.requiredIntegrations.forEach(integration => {
            const fileName = `${integration}.bundle.js`;
            addStaticAssetSymlink(
              this.localOutPath,
              path.resolve(
                PACKAGES_DIR,
                'browser',
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
