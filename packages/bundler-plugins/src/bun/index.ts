import type { Options } from '../core';
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  CodeInjection,
} from '../core';
import * as fs from 'node:fs';

interface BunBuildArtifact {
  path: string;
  kind: string;
}

interface BunBuildConfig {
  banner?: string;
  sourcemap?: 'none' | 'linked' | 'inline' | 'external' | boolean;
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

      // Without `outdir`, Bun writes no files that the placeholder can be
      // replaced in.
      const injectDebugIds =
        options.sourcemaps?.disable !== true && !!config.outdir && !!config.sourcemap && config.sourcemap !== 'none';

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
        try {
          await sentryBuildPluginManager.createRelease();

          if (injectDebugIds) {
            const bundlePaths = result.outputs
              .filter(output => output.kind === 'entry-point' || output.kind === 'chunk')
              .map(output => output.path);

            await Promise.all(bundlePaths.map(replaceDebugIdPlaceholder));

            if (options.sourcemaps?.disable !== 'disable-upload') {
              await upload(bundlePaths);
            }
          }
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
