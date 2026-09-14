// Webpack 4 and 5 share this implementation so their behavior cannot drift apart.
/* oxlint-disable max-lines */

import type { Options } from '../core/index';
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  stringToUUID,
  createComponentNameAnnotateHooks,
  CodeInjection,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  isJsFile,
  stampDebugId,
} from '../core/index';
import { getCodeInjectionPosition } from '../core/get-code-injection-position';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const _req = createRequire(import.meta.url);

// Resolve the loader path via the package's own exports.
// webpack4and5.ts may end up in a shared chunk (_chunks/) whose import.meta.url
// does not point to the webpack/ directory where the transform file lives, so
// a path-relative lookup would fail. Using require.resolve on the package export
// always finds the correct installed file regardless of chunk placement.
let COMPONENT_ANNOTATION_LOADER: string;
try {
  COMPONENT_ANNOTATION_LOADER = _req.resolve('@sentry/bundler-plugins/webpack-loader');
} catch {
  // Fallback for non-packaged environments (e.g., monorepo source runs without dist)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore Rollup transpiles import.meta for us for CJS
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  // The Rollup build emits `.js` for both CJS and ESM, so the extension is the same in both.
  COMPONENT_ANNOTATION_LOADER = path.resolve(dirname, 'component-annotation-transform.js');
}

// since webpack 5.1 compiler contains webpack module so plugins always use correct webpack version
// https://github.com/webpack/webpack/commit/65eca2e529ce1d79b79200d4bdb1ce1b81141459

type UnsafeDefinePlugin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (options: any): unknown;
};

type WebpackCompilationApi = {
  PROCESS_ASSETS_STAGE_ADDITIONS: number;
  PROCESS_ASSETS_STAGE_DEV_TOOLING?: number;
};

type WebpackSources = {
  ReplaceSource: new (source: WebpackSource) => WebpackReplaceSource;
  RawSource?: WebpackRawSource;
};

type WebpackCompilationContext = {
  chunks: Iterable<{
    files: Iterable<string>;
    hash?: string;
    contentHash?: { javascript?: string };
  }>;
  hooks: {
    processAssets: {
      tap: (
        options: { name: string; stage: number },
        callback: (assets: Record<string, WebpackSource>) => void,
      ) => void;
    };
  };
  updateAsset: (name: string, source: WebpackSource) => void;
};

type WebpackAsset = {
  name: string;
  source: WebpackSource;
  info: {
    related?: {
      sourceMap?: string | string[];
    };
  };
};

type WebpackSource = {
  source: () => string | Uint8Array;
};

type WebpackRawSource = {
  new (source: string): WebpackSource;
};

type WebpackReplaceSource = WebpackSource & {
  insert: (position: number, value: string) => void;
};

const WEBPACK_JAVASCRIPT_ASSET_REGEX = /\.(?:js|ts|jsx|tsx|mjs|cjs|mts|cts)(?:\?[^?]*)?(?:#[^#]*)?$/;

type WebpackCompiler = {
  options: {
    plugins?: unknown[];
    mode?: string;
    module?: {
      rules?: unknown[];
    };
  };
  hooks: {
    compilation: {
      tap: (name: string, callback: (compilation: WebpackCompilationContext) => void) => void;
    };
    thisCompilation: {
      tap: (name: string, callback: (compilation: WebpackCompilation) => void) => void;
    };
    afterEmit: {
      tapAsync: (name: string, callback: (compilation: WebpackCompilation, cb: () => void) => void) => void;
    };
    done: {
      tap: (name: string, callback: () => void) => void;
    };
  };
  webpack?: {
    DefinePlugin?: UnsafeDefinePlugin;
    Compilation?: WebpackCompilationApi;
    sources?: WebpackSources;
  };
};

type WebpackCompilation = WebpackCompilationContext & {
  outputOptions: {
    path?: string;
  };
  assets: Record<string, unknown>;
  getAssets: () => WebpackAsset[];
  getAsset: (name: string) => WebpackAsset | undefined;
};

// Detect webpack major version for telemetry (helps differentiate webpack 4 vs 5 usage)
function getWebpackMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const webpack = req('webpack') as { version?: string; default?: { version?: string } };
    const version = webpack?.version ?? webpack?.default?.version;
    const webpackMajorVersion = version?.split('.')[0]; // "4" or "5"
    return webpackMajorVersion;
  } catch {
    return undefined;
  }
}

/**
 * Stamps each JS asset's debug ID into the asset itself and its source map asset.
 *
 * Runs after source maps have been generated, so the JS asset no longer needs to carry
 * source map information and can be replaced with a plain `RawSource`.
 */
function addDebugIdsToAssets(compilation: WebpackCompilation, RawSource: WebpackRawSource): void {
  for (const asset of compilation.getAssets()) {
    if (!isJsFile(asset.name)) {
      continue;
    }

    const bundleSource = asset.source.source().toString();
    const relatedSourceMap = asset.info.related?.sourceMap;
    const sourceMapName = typeof relatedSourceMap === 'string' ? relatedSourceMap : `${asset.name}.map`;
    const sourceMapAsset = compilation.getAsset(sourceMapName);

    const stamped = stampDebugId(bundleSource, sourceMapAsset?.source.source().toString());
    if (!stamped) {
      continue;
    }

    compilation.updateAsset(asset.name, new RawSource(stamped.bundleSource));
    if (stamped.sourceMapSource !== undefined) {
      compilation.updateAsset(sourceMapName, new RawSource(stamped.sourceMapSource));
    }
  }
}

/**
 * The factory accepts Webpack APIs to avoid a direct dependency on Webpack.
 *
 * This allows us to export a version of the plugin for Webpack 5.1+ and compatible environments.
 *
 * Since webpack 5.1 compiler contains webpack module so plugins always use correct webpack version.
 */
export function sentryWebpackPluginFactory({
  DefinePlugin: UnsafeDefinePlugin,
  Compilation: UnsafeCompilation,
  sources: unsafeSources,
}: {
  DefinePlugin?: UnsafeDefinePlugin;
  Compilation?: WebpackCompilationApi;
  sources?: WebpackSources;
} = {}) {
  return function sentryWebpackPlugin(userOptions: SentryWebpackPluginOptions = {}) {
    const sentryBuildPluginManager = createSentryBuildPluginManager(userOptions, {
      loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? '[sentry-webpack-plugin]',
      buildTool: 'webpack',
      buildToolMajorVersion: getWebpackMajorVersion(),
    });

    const {
      logger,
      normalizedOptions: options,
      bundleSizeOptimizationReplacementValues: replacementValues,
      bundleMetadata,
      createDependencyOnBuildArtifacts,
    } = sentryBuildPluginManager;

    if (options.disable) {
      return {
        apply() {
          // noop plugin
        },
      };
    }

    if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
      logger.warn('Running Sentry plugin from within a `node_modules` folder. Some features may not work.');
    }

    const sourcemapsEnabled = options.sourcemaps?.disable !== true;
    const staticInjectionCode = new CodeInjection();

    if (!options.release.inject) {
      logger.debug('Release injection disabled via `release.inject` option. Will not inject release.');
    } else if (!options.release.name) {
      logger.debug(
        'No release name provided. Will not inject release. Please set the `release.name` option to identify your release.',
      );
    } else {
      staticInjectionCode.append(
        generateReleaseInjectorCode({
          release: options.release.name,
          injectBuildInformation: options._experiments.injectBuildInformation || false,
        }),
      );
    }

    if (Object.keys(bundleMetadata).length > 0) {
      staticInjectionCode.append(generateModuleMetadataInjectorCode(bundleMetadata));
    }

    const transformAnnotations = options.reactComponentAnnotation?.enabled
      ? createComponentNameAnnotateHooks(
          options.reactComponentAnnotation?.ignoredComponents || [],
          !!options.reactComponentAnnotation?._experimentalInjectIntoHtml,
        )
      : undefined;

    const transformReplace = Object.keys(replacementValues).length > 0;

    function addCodeInjection(compiler: WebpackCompiler): void {
      if (staticInjectionCode.isEmpty() && !sourcemapsEnabled) {
        return;
      }

      const ReplaceSource = compiler.webpack?.sources?.ReplaceSource || unsafeSources?.ReplaceSource;
      const processAssetsStage =
        compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_ADDITIONS ??
        UnsafeCompilation?.PROCESS_ASSETS_STAGE_ADDITIONS;

      if (!ReplaceSource || processAssetsStage === undefined) {
        logger.warn(
          'Webpack sources are not available. Skipping code injection. This usually means webpack is not properly configured.',
        );
        return;
      }

      compiler.hooks.compilation.tap('sentry-webpack-plugin-injection', compilation => {
        compilation.hooks.processAssets.tap(
          {
            name: 'sentry-webpack-plugin-injection',
            stage: processAssetsStage,
          },
          assets => {
            for (const chunk of compilation.chunks) {
              for (const assetName of chunk.files) {
                if (!WEBPACK_JAVASCRIPT_ASSET_REGEX.test(assetName)) {
                  continue;
                }

                const source = assets[assetName];
                if (!source) {
                  continue;
                }

                const sourceContents = source.source();
                const codeString =
                  typeof sourceContents === 'string' ? sourceContents : Buffer.from(sourceContents).toString();
                const codeToInject = staticInjectionCode.clone();
                if (sourcemapsEnabled) {
                  const hash = chunk.contentHash?.javascript ?? chunk.hash;
                  codeToInject.append(getDebugIdSnippet(hash ? stringToUUID(hash) : randomUUID()));
                }

                const injectionPosition = getCodeInjectionPosition(codeString);
                const injection =
                  injectionPosition === codeString.length ? `\n${codeToInject.code()}` : `${codeToInject.code()}\n`;
                const updatedSource = new ReplaceSource(source);
                updatedSource.insert(injectionPosition, injection);
                compilation.updateAsset(assetName, updatedSource);
              }
            }
          },
        );
      });
    }

    return {
      apply(compiler: WebpackCompiler) {
        void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
          // Telemetry failures are acceptable
        });

        // Get the correct plugin classes (webpack 5.1+ vs older versions)
        const DefinePlugin = compiler?.webpack?.DefinePlugin || UnsafeDefinePlugin;

        // Injecting through BannerPlugin would place executable code before directive prologues.
        addCodeInjection(compiler);

        // The upload routine (which stamps debug IDs into temp copies of the artifacts) is skipped
        // with `disable-upload`, so the emitted artifacts get stamped in the asset pipeline instead.
        if (sourcemapsEnabled && options.sourcemaps?.disable === 'disable-upload') {
          const RawSource = compiler.webpack?.sources?.RawSource;
          // Right after source map generation (and thus after minification, which would strip the comment),
          // so later stages (real content hashing, subresource integrity) see the final assets.
          const stage = (compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_DEV_TOOLING ?? 500) + 1;

          if (!RawSource) {
            logger.warn(
              'Webpack sources are not available. Skipping debug ID injection into emitted source maps. This usually means webpack is not properly configured.',
            );
          } else {
            compiler.hooks.thisCompilation.tap('sentry-webpack-plugin', compilation => {
              compilation.hooks.processAssets.tap({ name: 'sentry-webpack-plugin', stage }, () => {
                addDebugIdsToAssets(compilation, RawSource);
              });
            });
          }
        }

        // Add DefinePlugin for bundle size optimizations
        if (transformReplace && DefinePlugin) {
          compiler.options.plugins = compiler.options.plugins || [];
          compiler.options.plugins.push(new DefinePlugin(replacementValues));
        }

        // Add component name annotation transform
        if (transformAnnotations?.transform) {
          compiler.options.module = compiler.options.module || {};
          compiler.options.module.rules = compiler.options.module.rules || [];
          compiler.options.module.rules.unshift({
            test: /\.[jt]sx$/,
            exclude: /node_modules/,
            enforce: 'pre',
            use: [
              {
                loader: COMPONENT_ANNOTATION_LOADER,
                options: {
                  transform: transformAnnotations.transform,
                },
              },
            ],
          });
        }

        compiler.hooks.afterEmit.tapAsync(
          'sentry-webpack-plugin',
          (compilation: WebpackCompilation, callback: (err?: Error) => void) => {
            const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
            const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });

            const run = async (): Promise<void> => {
              try {
                await sentryBuildPluginManager.createRelease();
                if (sourcemapsEnabled && options.sourcemaps?.disable !== 'disable-upload') {
                  const outputPath = compilation.outputOptions.path ?? path.resolve();
                  const buildArtifacts = Object.keys(compilation.assets).map(asset => path.join(outputPath, asset));
                  await upload(buildArtifacts);
                }
              } finally {
                freeGlobalDependencyOnBuildArtifacts();
                await sentryBuildPluginManager.deleteArtifacts();
              }
            };

            run().then(
              () => callback(),
              (err: Error) => callback(err),
            );
          },
        );

        if (userOptions._experiments?.forceExitOnBuildCompletion && compiler.options.mode === 'production') {
          compiler.hooks.done.tap('sentry-webpack-plugin', () => {
            setTimeout(() => {
              logger.debug('Exiting process after debug file upload');
              process.exit(0);
            });
          });
        }
      },
    };
  };
}

export type SentryWebpackPluginOptions = Options & {
  _experiments?: Options['_experiments'] & {
    /**
     * If enabled, the webpack plugin will exit the build process after the build completes.
     * Use this with caution, as it will terminate the process.
     *
     * More information: https://github.com/getsentry/sentry-javascript-bundler-plugins/issues/345
     *
     * @default false
     */
    forceExitOnBuildCompletion?: boolean;
  };
};
