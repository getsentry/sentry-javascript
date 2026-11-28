import type { Options, SourceMapDecision, SourceMapKind } from '../core';
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  CodeInjection,
  getSourceMapFeatures,
  isJsFile,
} from '../core';
import * as fs from 'node:fs';

interface BunBuildArtifact {
  path: string;
  kind: string;
}

type BunSourceMapSetting = 'none' | 'linked' | 'inline' | 'external' | boolean;

interface BunBuildConfig {
  banner?: string;
  sourcemap?: BunSourceMapSetting;
  outdir?: string;
  define?: Record<string, string>;
}

interface BunPluginBuilder {
  // Bun passes no `config` when the plugin runs as a runtime plugin (`Bun.plugin()`)
  config?: BunBuildConfig;
  onEnd: (callback: (result: { outputs: BunBuildArtifact[] }) => void | Promise<void>) => void;
}

interface BunPlugin {
  name: string;
  setup: (build: BunPluginBuilder) => void;
}

const pluginName = 'sentry-bun-plugin';

// Bun computes the debug ID of an output after it adds the banner, so the
// banner holds this placeholder. It has the length of a debug ID, so the
// swap does not move any code that the source map points to.
const DEBUG_ID_PLACEHOLDER = 'sentry-bun-debug-id-placeholder-0000';
// Bun writes `//# sourceMappingURL=` after this comment for linked and
// inline source maps, so match the last debug ID line, not the file end.
const BUN_DEBUG_ID_REGEX = /^\/\/# debugId=([0-9a-fA-F]{32})$(?![\s\S]*^\/\/# debugId=)/m;

function sourceMapKindFromBunSetting(setting: BunSourceMapSetting | undefined): SourceMapKind {
  switch (setting) {
    case undefined:
      return 'unset';
    case false:
    case 'none':
      return 'off';
    case 'external':
      return 'hidden';
    case 'inline':
      return 'inline';
    default:
      return 'visible';
  }
}

function bunDebugIdToUuid(bunDebugId: string): string {
  const hex = bunDebugId.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sentryBunPlugin(userOptions: Options = {}): BunPlugin {
  const sentryBuildPluginManager = createSentryBuildPluginManager(userOptions, {
    loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? `[${pluginName}]`,
    buildTool: 'bun',
    buildToolMajorVersion: process.versions['bun']?.split('.')[0],
  });

  const {
    logger,
    normalizedOptions: options,
    bundleSizeOptimizationReplacementValues: replacementValues,
    bundleMetadata,
    createDependencyOnBuildArtifacts,
  } = sentryBuildPluginManager;

  if (options.disable) {
    return { name: 'sentry-bun-noop-plugin', setup: () => undefined };
  }

  const sourceMapFeatures = getSourceMapFeatures(options);

  const staticInjectionCode = new CodeInjection();

  if (options.release.inject === 'html') {
    logger.warn(
      "`release.inject: 'html'` is not supported by the Bun plugin. Injecting the release into the startup chunks instead.",
    );
  }

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

  void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
    // Telemetry failures are acceptable
  });

  async function replaceDebugIdPlaceholder(bundlePath: string): Promise<void> {
    const source = await fs.promises.readFile(bundlePath, 'utf8');
    const bunDebugId = source.match(BUN_DEBUG_ID_REGEX)?.[1];
    if (!bunDebugId) {
      logger.debug(`Bun wrote no debug ID into the bundle. File will not be source mapped: ${bundlePath}`);
      return;
    }

    await fs.promises.writeFile(
      bundlePath,
      source.split(DEBUG_ID_PLACEHOLDER).join(bunDebugIdToUuid(bunDebugId)),
      'utf8',
    );
  }

  return {
    name: pluginName,
    setup(build: BunPluginBuilder): void {
      const config = build.config;
      if (!config) {
        return;
      }

      // Without `outdir`, Bun keeps the output in memory, so there are no
      // files to stamp, upload or delete.
      const sourceMapDecision: SourceMapDecision = config.outdir
        ? sentryBuildPluginManager.sourceMaps.decide(sourceMapKindFromBunSetting(config.sourcemap))
        : { enableHidden: false, deleteAfterUpload: false };
      if (sourceMapDecision.enableHidden) {
        config.sourcemap = 'external';
      }

      const injectDebugIds =
        sourceMapFeatures.injectDebugIds && !!config.outdir && !!config.sourcemap && config.sourcemap !== 'none';

      const injectionCode = new CodeInjection();
      injectionCode.append(staticInjectionCode);
      if (injectDebugIds) {
        injectionCode.append(getDebugIdSnippet(DEBUG_ID_PLACEHOLDER));
      }

      if (!injectionCode.isEmpty()) {
        config.banner = config.banner ? `${config.banner}\n${injectionCode.code()}` : injectionCode.code();
      }

      if (Object.keys(replacementValues).length > 0) {
        const replacementStringValues: Record<string, string> = {};
        Object.entries(replacementValues).forEach(([key, value]) => {
          replacementStringValues[key] = JSON.stringify(value);
        });

        config.define = { ...config.define, ...replacementStringValues };
      }

      const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
      const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });

      build.onEnd(async result => {
        const { sourceMaps } = sentryBuildPluginManager;
        const allMaps = result.outputs.filter(output => output.kind === 'sourcemap').map(output => output.path);

        try {
          await sentryBuildPluginManager.createRelease();

          const deleteWithoutUpload = sourceMapDecision.deleteAfterUpload && !sourceMaps.uploadPossible;
          if (injectDebugIds) {
            const bundlePaths = result.outputs
              .filter(output => output.kind === 'entry-point' || output.kind === 'chunk')
              .map(output => output.path);

            await Promise.all(bundlePaths.map(replaceDebugIdPlaceholder));

            if (sourceMapFeatures.upload) {
              const { uploaded, uploadedSourceMapPaths } = await upload(bundlePaths);

              // Bun writes before `onEnd` runs, so the maps are deleted from
              // disk. A map the plugin turned on never stays in the output. A
              // map the user turned on is only deleted once it was uploaded,
              // unless `sourcemaps.delete` asks for it.
              if (sourceMapDecision.deleteAfterUpload && !deleteWithoutUpload) {
                const mapsToDelete = sourceMapDecision.removeAllSourceMaps ? allMaps : uploadedSourceMapPaths;

                if (uploaded || options.sourcemaps?.delete === true) {
                  await sourceMaps.deleteFromOutput(mapsToDelete);
                } else if (mapsToDelete.length > 0) {
                  logger.error('The source maps were not uploaded, so they stay in the build output.');
                }
              }
            }
          }

          if (deleteWithoutUpload) {
            const bundleOf = (map: string): string => map.slice(0, -'.map'.length);
            const isUploaded = (map: string): boolean =>
              isJsFile(bundleOf(map)) && sourceMaps.shouldUpload(bundleOf(map));
            await sourceMaps.deleteFromOutput(
              sourceMapDecision.removeAllSourceMaps ? allMaps : allMaps.filter(isUploaded),
            );
          }
        } catch (error) {
          // Bun already wrote the maps, and `sourcemaps.delete: true` also
          // applies when the release or upload step fails.
          if (options.sourcemaps?.delete === true && sourceMapDecision.deleteAfterUpload) {
            await sourceMaps.deleteFromOutput(allMaps);
          }
          throw error;
        } finally {
          freeGlobalDependencyOnBuildArtifacts();
          await sentryBuildPluginManager.deleteArtifacts();
        }
      });
    },
  };
}

export default sentryBunPlugin;
export type { Options as SentryBunPluginOptions } from '../core';
