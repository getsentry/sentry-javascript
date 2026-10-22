/* oxlint-disable max-lines */

import type { Options, SourceMapDecision, SourceMapKind, UploadStaging } from '../core/index';
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  stringToUUID,
  createComponentNameAnnotateHooks,
  CodeInjection,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  getCodeInjectionPosition,
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

type WebpackReplaceSource = WebpackSource & {
  insert: (position: number, value: string) => void;
};

const WEBPACK_JAVASCRIPT_ASSET_REGEX = /\.(?:js|ts|jsx|tsx|mjs|cjs|mts|cts)(?:\?[^?]*)?(?:#[^#]*)?$/;

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
    devtool?: string | false;
    module?: {
      rules?: unknown[];
    };
  };
  hooks: {
    compilation: {
      tap: (name: string, callback: (compilation: WebpackCompilation) => void) => void;
    };
    thisCompilation: {
      tap: (name: string, callback: (compilation: WebpackCompilation) => void) => void;
    };
    emit: {
      tap: (name: string, callback: (compilation: WebpackCompilation) => void) => void;
    };
    afterEmit: {
      tapAsync: (name: string, callback: (compilation: WebpackCompilation, cb: () => void) => void) => void;
    };
    done: {
      tap: (name: string, callback: () => void) => void;
    };
    failed?: {
      tap: (name: string, callback: () => void) => void;
    };
  };
  webpack?: {
    DefinePlugin?: PluginClass;
    Compilation?: {
      PROCESS_ASSETS_STAGE_ADDITIONS?: number;
      PROCESS_ASSETS_STAGE_DEV_TOOLING?: number;
      PROCESS_ASSETS_STAGE_REPORT?: number;
    };
    sources?: {
      RawSource?: WebpackRawSource;
      ReplaceSource?: new (source: WebpackSource) => WebpackReplaceSource;
    };
  };
};

type WebpackCompilation = {
  chunks: Iterable<{
    files: Iterable<string>;
    hash?: string;
    contentHash?: { javascript?: string };
    canBeInitial?: () => boolean;
  }>;
  outputOptions: {
    path?: string;
  };
  assets: Record<string, unknown>;
  getAssets: () => WebpackAsset[];
  getAsset: (name: string) => WebpackAsset | undefined;
  updateAsset: (name: string, source: WebpackSource) => void;
  deleteAsset: (name: string) => void;
  hooks: {
    processAssets: {
      tap: (
        options: { name: string; stage: number },
        callback: (assets: Record<string, WebpackSource>) => void,
      ) => void;
      tapPromise: (options: { name: string; stage: number }, callback: () => Promise<void>) => void;
    };
  };
};

/**
 * Maps webpack's `devtool` onto the plugin's source map kinds. A user who sets `devtool: false`
 * and adds a `SourceMapDevToolPlugin` manages source maps themselves.
 */
function sourceMapKindFromDevtool(compiler: WebpackCompiler): SourceMapKind | undefined {
  const devtool = compiler.options.devtool;

  if (devtool === undefined) {
    return 'unset';
  }
  if (devtool === false) {
    const hasSourceMapPlugin = compiler.options.plugins?.some(
      plugin =>
        (plugin as { constructor?: { name?: string } } | undefined)?.constructor?.name === 'SourceMapDevToolPlugin',
    );
    return hasSourceMapPlugin ? undefined : 'off';
  }
  if (devtool.includes('inline') || devtool.includes('eval')) {
    return 'inline';
  }
  if (devtool.includes('hidden')) {
    return 'hidden';
  }
  return 'visible';
}

type WebpackModule = {
  version?: string;
  default?: { version?: string };
};

// Only used for telemetry; `webpack` is an optional peer dependency and may be absent (e.g. rspack).
function getWebpackMajorVersion(): string | undefined {
  try {
    const webpack = _req('webpack') as WebpackModule;
    const version = webpack.version ?? webpack.default?.version;
    return version?.split('.')[0];
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
 * Copies each JS asset and its source map into the upload staging folder and drops the source map
 * assets (and their compressed variants) from the compilation, so webpack never emits them.
 */
async function stageSourceMaps(
  compilation: WebpackCompilation,
  staging: UploadStaging,
  logger: { warn: (message: string) => void },
): Promise<void> {
  const outputPath = compilation.outputOptions.path ?? path.resolve();

  for (const asset of compilation.getAssets()) {
    if (!isJsFile(asset.name)) {
      continue;
    }

    const relatedSourceMap = asset.info.related?.sourceMap;
    const sourceMapName = typeof relatedSourceMap === 'string' ? relatedSourceMap : `${asset.name}.map`;
    const sourceMapAsset = compilation.getAsset(sourceMapName);
    if (!sourceMapAsset) {
      continue;
    }

    const result = await staging.stage({
      code: asset.source.source().toString(),
      mapSource: sourceMapAsset.source.source().toString(),
      mapDir: path.join(outputPath, path.dirname(sourceMapName)),
      chunkPath: path.join(outputPath, asset.name),
    });

    if (result === 'excluded') {
      continue;
    }
    if (result !== 'staged') {
      logger.warn(
        `Could not prepare ${asset.name} for upload, so its source map ${sourceMapName} stays in the build output.`,
      );
      continue;
    }

    for (const candidate of compilation.getAssets()) {
      if (candidate.name === sourceMapName || candidate.name.startsWith(`${sourceMapName}.`)) {
        compilation.deleteAsset(candidate.name);
      }
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
  const releaseInjectionCode = new CodeInjection();
  const chunkInjectionCode = new CodeInjection();

  if (!options.release.inject) {
    logger.debug('Release injection disabled via `release.inject` option. Will not inject release.');
  } else if (!options.release.name) {
    logger.debug(
      'No release name provided. Will not inject release. Please set the `release.name` option to identify your release.',
    );
  } else {
    releaseInjectionCode.append(
      generateReleaseInjectorCode({
        release: options.release.name,
        injectBuildInformation: options._experiments.injectBuildInformation || false,
      }),
    );
  }

  if (Object.keys(bundleMetadata).length > 0) {
    chunkInjectionCode.append(generateModuleMetadataInjectorCode(bundleMetadata));
  }

  const transformAnnotations = options.reactComponentAnnotation?.enabled
    ? createComponentNameAnnotateHooks(
        options.reactComponentAnnotation?.ignoredComponents || [],
        !!options.reactComponentAnnotation?._experimentalInjectIntoHtml,
        { logger },
      )
    : undefined;

  const transformReplace = Object.keys(replacementValues).length > 0;

  function decideSourceMaps(compiler: WebpackCompiler): SourceMapDecision {
    const kind = compiler.options.mode === 'development' ? undefined : sourceMapKindFromDevtool(compiler);
    if (kind === undefined) {
      return { enableHidden: false, deleteAfterUpload: false };
    }

    const decision = sentryBuildPluginManager.sourceMaps.decide(kind);

    if (decision.enableHidden) {
      compiler.options.devtool = kind === 'visible' ? `hidden-${compiler.options.devtool}` : 'hidden-source-map';
    }

    return decision;
  }

  function addCodeInjection(compiler: WebpackCompiler): void {
    if (releaseInjectionCode.isEmpty() && chunkInjectionCode.isEmpty() && !sourcemapsEnabled) {
      return;
    }

    const ReplaceSource = compiler.webpack?.sources?.ReplaceSource;
    const processAssetsStage = compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_ADDITIONS;

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
          const injectedAssets = new Set<string>();

          for (const chunk of compilation.chunks) {
            for (const assetName of chunk.files) {
              if (injectedAssets.has(assetName) || !WEBPACK_JAVASCRIPT_ASSET_REGEX.test(assetName)) {
                continue;
              }

              const source = assets[assetName];
              if (!source) {
                continue;
              }
              injectedAssets.add(assetName);

              const sourceContents = source.source();
              const code = typeof sourceContents === 'string' ? sourceContents : Buffer.from(sourceContents).toString();
              const codeToInject = new CodeInjection();
              if (chunk.canBeInitial?.() ?? true) {
                codeToInject.append(releaseInjectionCode);
              }
              codeToInject.append(chunkInjectionCode);
              if (sourcemapsEnabled) {
                const hash = chunk.contentHash?.javascript ?? chunk.hash;
                codeToInject.append(getDebugIdSnippet(hash ? stringToUUID(hash) : randomUUID()));
              }

              const injectionPosition = getCodeInjectionPosition(code);
              const injection = injectionPosition === code.length ? `\n${codeToInject.code()}` : codeToInject.code();
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

      const { DefinePlugin } = compiler.webpack ?? {};

      // One plugin instance can serve several compilers (`MultiCompiler`) and
      // a compiler several compilations (watch mode), so nothing is shared.
      const sourceMapDecision = decideSourceMaps(compiler);
      const pendingStagings = new Map<WebpackCompilation, UploadStaging>();

      if (sourceMapDecision.deleteAfterUpload) {
        // After `RealContentHashPlugin` rewrote the hash placeholders, so the staged
        // JS equals the emitted file and `[contenthash]` names are final.
        const stage = (compiler.webpack?.Compilation?.PROCESS_ASSETS_STAGE_REPORT ?? 5000) + 1;

        compiler.hooks.thisCompilation.tap('sentry-webpack-plugin', compilation => {
          compilation.hooks.processAssets.tapPromise({ name: 'sentry-webpack-plugin', stage }, async () => {
            const staging = await sentryBuildPluginManager.createUploadStaging();
            pendingStagings.set(compilation, staging);
            await stageSourceMaps(compilation, staging, logger);
          });
        });

        // A staging that `afterEmit` never took belongs to a compilation that
        // failed before emitting, or to one whose assets were emitted without
        // their maps because an earlier `afterEmit` tap failed. Only the
        // second kind has no other copy of the maps.
        const emittedCompilations = new Set<WebpackCompilation>();
        compiler.hooks.emit.tap('sentry-webpack-plugin', compilation => {
          emittedCompilations.add(compilation);
        });
        const settlePendingStagings = (): void => {
          for (const [compilation, staging] of pendingStagings) {
            if (emittedCompilations.has(compilation)) {
              void staging.keep('The source map upload did not run.');
            } else {
              void staging.discard();
            }
          }
          pendingStagings.clear();
          emittedCompilations.clear();
        };
        compiler.hooks.done.tap('sentry-webpack-plugin', settlePendingStagings);
        compiler.hooks.failed?.tap('sentry-webpack-plugin', settlePendingStagings);
      }

      // BannerPlugin prepends executable code before directive prologues.
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

          const staging = pendingStagings.get(compilation);
          pendingStagings.delete(compilation);
          let stagingHandedOver = false;

          const run = async (): Promise<void> => {
            try {
              await sentryBuildPluginManager.createRelease();
              if (sourcemapsEnabled && options.sourcemaps?.disable !== 'disable-upload') {
                const outputPath = compilation.outputOptions.path ?? path.resolve();
                const buildArtifacts = Object.keys(compilation.assets).map(asset => path.join(outputPath, asset));
                stagingHandedOver = true;
                await upload(buildArtifacts, { staging });
              } else {
                stagingHandedOver = true;
                await staging?.discard();
              }
            } catch (e) {
              if (!stagingHandedOver) {
                await staging?.keep('The source map upload did not run.');
              }
              throw e;
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
