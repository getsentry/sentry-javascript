import type { ChunkGraphNode, Options } from '../core';
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  isJsFile,
  isInitialChunk,
  shouldSkipCodeInjection,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  globFiles,
  createComponentNameAnnotateHooks,
  replaceBooleanFlagsInCode,
  CodeInjection,
  getCodeInjectionPosition,
} from '../core';
import type { ComponentAnnotationTransformMeta } from '../core/component-annotation-oxc';
import type { SourceMap } from 'magic-string';
import MagicString from 'magic-string';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { finalizeRolldownDebugIds, getDebugIdForChunk, hasExistingDebugID } from './debug-id-injection';
import { stampDebugIds, type OutputBundle } from './debug-id-stamping';
import { createSourceMapHandling, type OutputDestinationOptions } from './source-map-handling';

// The subset of Rollup's `TransformResult` that this plugin's `transform`
// hook actually returns. Defined locally instead of imported from `rollup`
// because `rollup` is an optional dependency.
type TransformResult = { code: string; map?: SourceMap | string | { mappings: string } | null } | null | undefined;

type ViteModule = {
  parseAstAsync?: (code: string, options: { lang: 'jsx' | 'tsx' }) => Promise<unknown>;
};

type ViteParseAstAsync = NonNullable<ViteModule['parseAstAsync']>;

let viteParseAstAsyncPromise: Promise<ViteParseAstAsync | null> | undefined;

// Rolldown sets `meta.rolldownVersion` on the plugin context.
type PluginContext = { meta?: { rolldownVersion?: string } };

const JS_MODULE_ID_FILTER = /\.[cm]?[jt]sx?(?:[?#].*)?$/;

function getRollupMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const rollup = req('rollup') as { VERSION?: string };
    return rollup.VERSION?.split('.')[0];
  } catch {
    // do nothing, we'll just not report a version
  }

  return undefined;
}

function getViteParseAstAsync(): Promise<ViteParseAstAsync | null> {
  if (!viteParseAstAsyncPromise) {
    viteParseAstAsyncPromise = Promise.resolve()
      .then(async () => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Vite is an optional runtime peer for this package
        const viteModule = createRequire(import.meta.url)('vite') as ViteModule;

        if (typeof viteModule.parseAstAsync !== 'function') {
          return null;
        }

        try {
          await viteModule.parseAstAsync('const x = <div />;', { lang: 'tsx' });
        } catch {
          return null;
        }

        return viteModule.parseAstAsync;
      })
      .catch(() => null);
  }

  return viteParseAstAsyncPromise;
}

/**
 * @ignore - internal plugin factory shared by the Rollup and Vite plugins.
 *
 * `main` carries injection, release creation and the upload. `post` runs last in `generateBundle`,
 * copies chunks and their source maps into the upload staging folder and drops the map assets
 * from the bundle, so the bundler never writes them.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function _createRollupPluginInternals(
  userOptions: Options = {},
  buildTool: 'rollup' | 'vite',
  buildToolMajorVersion?: string,
) {
  const sentryBuildPluginManager = createSentryBuildPluginManager(userOptions, {
    loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? `[sentry-${buildTool}-plugin]`,
    buildTool,
    buildToolMajorVersion: buildToolMajorVersion || getRollupMajorVersion(),
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
      main: {
        name: 'sentry-noop-plugin',
      },
      post: undefined,
    };
  }

  if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
    logger.warn('Running Sentry plugin from within a `node_modules` folder. Some features may not work.');
  }

  const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
  const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });
  const sourcemapsEnabled = options.sourcemaps?.disable !== true;
  const sourceMapHandling = createSourceMapHandling(sentryBuildPluginManager);
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
        {
          // Vite 8 already loads an oxc-based parser, so reuse it.
          getParseAstAsync: buildTool === 'vite' && buildToolMajorVersion === '8' ? getViteParseAstAsync : undefined,
          logger,
        },
      )
    : undefined;

  const transformReplace = Object.keys(replacementValues).length > 0;
  const shouldTransform = transformAnnotations || transformReplace;

  function buildStart(): void {
    void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
      // Telemetry failures are acceptable
    });
  }

  async function transform(
    code: string,
    id: string,
    meta?: ComponentAnnotationTransformMeta,
  ): Promise<TransformResult> {
    // Component annotations are only in user code and boolean flag replacements are
    // only in Sentry code. If we successfully add annotations, we can return early.
    if (transformAnnotations) {
      const result = await transformAnnotations.transform(code, id, meta);
      if (result) {
        return result;
      }
    }

    if (transformReplace) {
      return replaceBooleanFlagsInCode(code, replacementValues);
    }

    return null;
  }

  function renderChunk(
    this: PluginContext | undefined,
    code: string,
    chunk: { fileName: string; facadeModuleId?: string | null; isEntry?: boolean },
    _?: unknown,
    meta?: { magicString?: MagicString; chunks?: Record<string, ChunkGraphNode> },
  ): {
    code: string;
    map?: SourceMap;
  } | null {
    if (!isJsFile(chunk.fileName)) {
      return null; // returning null means not modifying the chunk at all
    }

    // Skip empty chunks and HTML facade chunks (Vite MPA)
    if (shouldSkipCodeInjection(code, chunk.facadeModuleId)) {
      return null;
    }

    const injectCode = new CodeInjection();

    if (isInitialChunk(chunk, meta?.chunks)) {
      injectCode.append(releaseInjectionCode);
    }

    injectCode.append(chunkInjectionCode);

    if (sourcemapsEnabled && !hasExistingDebugID(code)) {
      const debugId = getDebugIdForChunk(code, !!this?.meta?.rolldownVersion);
      injectCode.append(getDebugIdSnippet(debugId));
    }

    if (injectCode.isEmpty()) {
      return null;
    }

    const ms = meta?.magicString || new MagicString(code, { filename: chunk.fileName });
    const injectionPosition = getCodeInjectionPosition(code);
    const codeToInject = injectionPosition === code.length ? `\n${injectCode.code()}` : injectCode.code();
    ms.appendLeft(injectionPosition, codeToInject);

    // Rolldown can pass a native MagicString instance in meta.magicString
    // https://rolldown.rs/in-depth/native-magic-string#usage-examples
    if (ms?.constructor?.name === 'BindingMagicString') {
      // Rolldown docs say to return the magic string instance directly in this case
      return { code: ms as unknown as string };
    }

    return {
      code: ms.toString(),
      map: ms.generateMap({ file: chunk.fileName, hires: 'boundary' }),
    };
  }

  /**
   * Resolves Rolldown's placeholder debug IDs, then stamps debug IDs into the emitted chunks and
   * source maps.
   *
   * `disable-upload` skips the upload routine (which stamps debug IDs into temp copies), so the emitted
   * artifacts get stamped here instead. Not in `renderChunk`: minifiers running after it would strip the
   * comment. Rollup computes `[hash]` file names before this hook, so only plugins that hash the final
   * assets afterwards (e.g. subresource integrity) see the stamped content.
   */
  function generateBundle(this: PluginContext | undefined, _outputOptions: unknown, bundle: OutputBundle): void {
    if (this?.meta?.rolldownVersion) {
      finalizeRolldownDebugIds(bundle);
    }

    if (options.sourcemaps?.disable !== 'disable-upload') {
      return;
    }

    stampDebugIds(bundle, true);
  }

  async function writeBundle(outputOptions: OutputDestinationOptions, bundle: OutputBundle | undefined): Promise<void> {
    const staging = await sourceMapHandling.takeStaging(outputOptions, bundle);
    let stagingHandedOver = false;

    try {
      await sentryBuildPluginManager.createRelease();

      if (sourcemapsEnabled && options.sourcemaps?.disable !== 'disable-upload') {
        let buildArtifacts: string[];
        if (outputOptions.dir) {
          const outputDir = outputOptions.dir;
          const JS_AND_MAP_PATTERNS = [
            '/**/*.js',
            '/**/*.mjs',
            '/**/*.cjs',
            '/**/*.js.map',
            '/**/*.mjs.map',
            '/**/*.cjs.map',
          ].map(q => `${q}?(\\?*)?(#*)`); // We want to allow query and hash strings at the end of files
          buildArtifacts = await globFiles(JS_AND_MAP_PATTERNS, { root: outputDir });
        } else if (outputOptions.file) {
          buildArtifacts = [outputOptions.file];
        } else {
          buildArtifacts = Object.keys(bundle ?? {}).map(asset => path.join(path.resolve(), asset));
        }
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
  }

  const name = `sentry-${buildTool}-plugin`;
  const transformHook =
    buildTool === 'vite'
      ? {
          filter: { id: JS_MODULE_ID_FILTER },
          handler: transform,
        }
      : transform;

  const main = {
    name,
    buildStart,
    ...(shouldTransform ? { transform: transformHook } : {}),
    // Vite warns about `rollupOptions.output.sourcemap`, so the Vite plugin
    // decides in its `config` hook instead.
    ...(buildTool === 'rollup' ? { outputOptions: sourceMapHandling.outputOptions } : {}),
    renderChunk,
    generateBundle: { order: 'pre' as const, handler: generateBundle },
    writeBundle,
  };

  const post = {
    name: `sentry-${buildTool}-upload-staging`,
    generateBundle: { order: 'post' as const, handler: sourceMapHandling.stageSourceMaps },
  };

  return { main, post };
}

/**
 * @ignore - this is the internal plugin factory function only used for the Vite plugin!
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function _rollupPluginInternal(
  userOptions: Options = {},
  buildTool: 'rollup' | 'vite',
  buildToolMajorVersion?: string,
) {
  return _createRollupPluginInternals(userOptions, buildTool, buildToolMajorVersion).main;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
export function sentryRollupPlugin(userOptions: Options = {}): any {
  const { main, post } = _createRollupPluginInternals(userOptions, 'rollup');
  // We return an array here so we don't break backwards compatibility with what
  // unplugin used to return
  return post ? [main, post] : [main];
}

export type { Options as SentryRollupPluginOptions } from '../core';
