import type { Options } from "@sentry/bundler-plugin-core";
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  isJsFile,
  shouldSkipCodeInjection,
  getDebugIdSnippet,
  stringToUUID,
  COMMENT_USE_STRICT_REGEX,
  createDebugIdUploadFunction,
  globFiles,
  createComponentNameAnnotateHooks,
  replaceBooleanFlagsInCode,
  CodeInjection,
} from "@sentry/bundler-plugin-core";
import type { SourceMap } from "magic-string";
import MagicString from "magic-string";
import type { TransformResult } from "rollup";
import * as path from "node:path";
import { createRequire } from "node:module";

function hasExistingDebugID(code: string): boolean {
  // Check if a debug ID has already been injected to avoid duplicate injection (e.g. by another plugin or Sentry CLI)
  const chunkStartSnippet = code.slice(0, 6000);
  const chunkEndSnippet = code.slice(-500);

  if (
    chunkStartSnippet.includes("_sentryDebugIdIdentifier") ||
    chunkEndSnippet.includes("//# debugId=")
  ) {
    return true; // Debug ID already present, skip injection
  }

  return false;
}

function getRollupMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - Rollup already transpiles this for us
    const req = createRequire(import.meta.url);
    const rollup = req("rollup") as { VERSION?: string };
    return rollup.VERSION?.split(".")[0];
  } catch {
    // do nothing, we'll just not report a version
  }

  return undefined;
}

/**
 * @ignore - this is the internal plugin factory function only used for the Vite plugin!
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function _rollupPluginInternal(
  userOptions: Options = {},
  buildTool: "rollup" | "vite",
  buildToolMajorVersion?: string
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
      name: "sentry-noop-plugin",
    };
  }

  if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
    logger.warn(
      "Running Sentry plugin from within a `node_modules` folder. Some features may not work."
    );
  }

  const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
  const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });
  const sourcemapsEnabled = options.sourcemaps?.disable !== true;
  const staticInjectionCode = new CodeInjection();

  if (!options.release.inject) {
    logger.debug(
      "Release injection disabled via `release.inject` option. Will not inject release."
    );
  } else if (!options.release.name) {
    logger.debug(
      "No release name provided. Will not inject release. Please set the `release.name` option to identify your release."
    );
  } else {
    staticInjectionCode.append(
      generateReleaseInjectorCode({
        release: options.release.name,
        injectBuildInformation: options._experiments.injectBuildInformation || false,
      })
    );
  }

  if (Object.keys(bundleMetadata).length > 0) {
    staticInjectionCode.append(generateModuleMetadataInjectorCode(bundleMetadata));
  }

  const transformAnnotations = options.reactComponentAnnotation?.enabled
    ? createComponentNameAnnotateHooks(
        options.reactComponentAnnotation?.ignoredComponents || [],
        !!options.reactComponentAnnotation?._experimentalInjectIntoHtml
      )
    : undefined;

  const transformReplace = Object.keys(replacementValues).length > 0;
  const shouldTransform = transformAnnotations || transformReplace;

  function buildStart(): void {
    void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
      // Telemetry failures are acceptable
    });
  }

  async function transform(code: string, id: string): Promise<TransformResult> {
    // Component annotations are only in user code and boolean flag replacements are
    // only in Sentry code. If we successfully add annotations, we can return early.

    if (transformAnnotations?.transform) {
      const result = await transformAnnotations.transform(code, id);
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
    code: string,
    chunk: { fileName: string; facadeModuleId?: string | null },
    _?: unknown,
    meta?: { magicString?: MagicString }
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

    const injectCode = staticInjectionCode.clone();

    if (sourcemapsEnabled && !hasExistingDebugID(code)) {
      const debugId = stringToUUID(code); // generate a deterministic debug ID
      injectCode.append(getDebugIdSnippet(debugId));
    }

    if (injectCode.isEmpty()) {
      return null;
    }

    const ms = meta?.magicString || new MagicString(code, { filename: chunk.fileName });
    const match = code.match(COMMENT_USE_STRICT_REGEX)?.[0];

    if (match) {
      // Add injected code after any comments or "use strict" at the beginning of the bundle.
      ms.appendLeft(match.length, injectCode.code());
    } else {
      // ms.replace() doesn't work when there is an empty string match (which happens if
      // there is neither, a comment, nor a "use strict" at the top of the chunk) so we
      // need this special case here.
      ms.prepend(injectCode.code());
    }

    // Rolldown can pass a native MagicString instance in meta.magicString
    // https://rolldown.rs/in-depth/native-magic-string#usage-examples
    if (ms?.constructor?.name === "BindingMagicString") {
      // Rolldown docs say to return the magic string instance directly in this case
      return { code: ms as unknown as string };
    }

    return {
      code: ms.toString(),
      map: ms.generateMap({ file: chunk.fileName, hires: "boundary" as unknown as undefined }),
    };
  }

  async function writeBundle(
    outputOptions: { dir?: string; file?: string },
    bundle: { [fileName: string]: unknown }
  ): Promise<void> {
    try {
      await sentryBuildPluginManager.createRelease();

      if (sourcemapsEnabled && options.sourcemaps?.disable !== "disable-upload") {
        if (outputOptions.dir) {
          const outputDir = outputOptions.dir;
          const JS_AND_MAP_PATTERNS = [
            "/**/*.js",
            "/**/*.mjs",
            "/**/*.cjs",
            "/**/*.js.map",
            "/**/*.mjs.map",
            "/**/*.cjs.map",
          ].map((q) => `${q}?(\\?*)?(#*)`); // We want to allow query and hash strings at the end of files
          const buildArtifacts = await globFiles(JS_AND_MAP_PATTERNS, { root: outputDir });
          await upload(buildArtifacts);
        } else if (outputOptions.file) {
          await upload([outputOptions.file]);
        } else {
          const buildArtifacts = Object.keys(bundle).map((asset) =>
            path.join(path.resolve(), asset)
          );
          await upload(buildArtifacts);
        }
      }
    } finally {
      freeGlobalDependencyOnBuildArtifacts();
      await sentryBuildPluginManager.deleteArtifacts();
    }
  }

  const name = `sentry-${buildTool}-plugin`;

  if (shouldTransform) {
    return {
      name,
      buildStart,
      transform,
      renderChunk,
      writeBundle,
    };
  }

  return {
    name,
    buildStart,
    renderChunk,
    writeBundle,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any
export function sentryRollupPlugin(userOptions: Options = {}): any {
  // We return an array here so we don't break backwards compatibility with what
  // unplugin used to return
  return [_rollupPluginInternal(userOptions, "rollup")];
}

export type { Options as SentryRollupPluginOptions } from "@sentry/bundler-plugin-core";
export { sentryCliBinaryExists } from "@sentry/bundler-plugin-core";
