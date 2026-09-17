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
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const _req = createRequire(import.meta.url);

// Resolve the loader path via the package's own exports.
// This module may end up in a shared chunk (_chunks/) whose import.meta.url
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

interface BannerPluginCallbackArg {
  chunk?: {
    hash?: string;
    contentHash?: {
      javascript?: string;
    };
  };
}

type PluginClass = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (options: any): unknown;
};

type WebpackSource = {
  source: () => string | Buffer;
};

type WebpackRawSource = {
  new (source: string): WebpackSource;
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

type WebpackCompiler = {
  options: {
    plugins?: unknown[];
    mode?: string;
    module?: {
      rules?: unknown[];
    };
  };
  hooks: {
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
    BannerPlugin?: PluginClass;
    DefinePlugin?: PluginClass;
    Compilation?: {
      PROCESS_ASSETS_STAGE_DEV_TOOLING?: number;
    };
    sources?: {
      RawSource?: WebpackRawSource;
    };
  };
};

type WebpackCompilation = {
  outputOptions: {
    path?: string;
  };
  assets: Record<string, unknown>;
  getAssets: () => WebpackAsset[];
  getAsset: (name: string) => WebpackAsset | undefined;
  updateAsset: (name: string, source: WebpackSource) => void;
  hooks: {
    processAssets: {
      tap: (options: { name: string; stage: number }, callback: () => void) => void;
    };
  };
};

type WebpackModule = {
  version?: string;
  BannerPlugin?: PluginClass;
  DefinePlugin?: PluginClass;
  default?: WebpackModule;
};

// `webpack` is an optional peer dependency and may be absent (e.g. rspack), so this must not throw.
function loadWebpack(): WebpackModule {
  try {
    return _req('webpack') as WebpackModule;
  } catch {
    return {};
  }
}

function getWebpackMajorVersion(): string | undefined {
  const webpack = loadWebpack();
  const version = webpack.version ?? webpack.default?.version;
  return version?.split('.')[0];
}

// `compiler.webpack` exists since webpack 5.1; older 5.0.x releases need the classes from the module.
function getPluginClasses(compiler: WebpackCompiler): { BannerPlugin?: PluginClass; DefinePlugin?: PluginClass } {
  if (compiler.webpack?.BannerPlugin && compiler.webpack.DefinePlugin) {
    return compiler.webpack;
  }
  const webpack = loadWebpack();
  return {
    BannerPlugin: compiler.webpack?.BannerPlugin ?? webpack.BannerPlugin ?? webpack.default?.BannerPlugin,
    DefinePlugin: compiler.webpack?.DefinePlugin ?? webpack.DefinePlugin ?? webpack.default?.DefinePlugin,
  };
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

function createSentryWebpackPlugin(userOptions: SentryWebpackPluginOptions = {}) {
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

  return {
    apply(compiler: WebpackCompiler) {
      void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
        // Telemetry failures are acceptable
      });

      const { BannerPlugin, DefinePlugin } = getPluginClasses(compiler);

      // Add BannerPlugin for code injection (release, metadata, debug IDs)
      if (!staticInjectionCode.isEmpty() || sourcemapsEnabled) {
        if (!BannerPlugin) {
          logger.warn(
            'BannerPlugin is not available. Skipping code injection. This usually means webpack is not properly configured.',
          );
        } else {
          compiler.options.plugins = compiler.options.plugins || [];
          compiler.options.plugins.push(
            new BannerPlugin({
              raw: true,
              include: /\.(js|ts|jsx|tsx|mjs|cjs)(\?[^?]*)?(#[^#]*)?$/,
              banner: (arg?: BannerPluginCallbackArg) => {
                const codeToInject = staticInjectionCode.clone();
                if (sourcemapsEnabled) {
                  const hash = arg?.chunk?.contentHash?.javascript ?? arg?.chunk?.hash;
                  const debugId = hash ? stringToUUID(hash) : randomUUID();
                  codeToInject.append(getDebugIdSnippet(debugId));
                }
                return codeToInject.code();
              },
            }),
          );
        }
      }

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sentryWebpackPlugin: (options?: SentryWebpackPluginOptions) => any = createSentryWebpackPlugin;

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
