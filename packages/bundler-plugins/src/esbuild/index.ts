import type { Options } from "../core";
import {
  createSentryBuildPluginManager,
  generateReleaseInjectorCode,
  generateModuleMetadataInjectorCode,
  getDebugIdSnippet,
  createDebugIdUploadFunction,
  CodeInjection,
} from "../core";
import * as path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

interface EsbuildOnResolveArgs {
  path: string;
  kind: string;
  importer?: string;
  resolveDir: string;
  pluginData?: unknown;
}

interface EsbuildOnResolveResult {
  path: string;
  sideEffects?: boolean;
  pluginName?: string;
  namespace?: string;
  suffix?: string;
  pluginData?: unknown;
}

interface EsbuildOnLoadArgs {
  path: string;
  pluginData?: unknown;
}

interface EsbuildOnLoadResult {
  loader: string;
  pluginName: string;
  contents: string;
  resolveDir?: string;
}

interface EsbuildOnEndArgs {
  metafile?: {
    outputs: Record<string, unknown>;
  };
}

interface EsbuildInitialOptions {
  bundle?: boolean;
  inject?: string[];
  metafile?: boolean;
  define?: Record<string, string>;
}

interface EsbuildPluginBuild {
  initialOptions: EsbuildInitialOptions;
  onLoad: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: EsbuildOnLoadArgs) => EsbuildOnLoadResult | null
  ) => void;
  onResolve: (
    options: { filter: RegExp },
    callback: (args: EsbuildOnResolveArgs) => EsbuildOnResolveResult | undefined
  ) => void;
  onEnd: (callback: (result: EsbuildOnEndArgs) => void | Promise<void>) => void;
}

function getEsbuildMajorVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - esbuild transpiles this for us
    const req = createRequire(import.meta.url);
    const esbuild = req("esbuild") as { version?: string };
    // esbuild hasn't released a v1 yet, so we'll return the minor version as the major version
    return esbuild.version?.split(".")[1];
  } catch {
    // do nothing, we'll just not report a version
  }

  return undefined;
}

const pluginName = "sentry-esbuild-plugin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sentryEsbuildPlugin(userOptions: Options = {}): any {
  const sentryBuildPluginManager = createSentryBuildPluginManager(userOptions, {
    loggerPrefix: userOptions._metaOptions?.loggerPrefixOverride ?? `[${pluginName}]`,
    buildTool: "esbuild",
    buildToolMajorVersion: getEsbuildMajorVersion(),
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
      name: "sentry-esbuild-noop-plugin",
      setup() {
        // noop plugin
      },
    };
  }

  if (process.cwd().match(/\\node_modules\\|\/node_modules\//)) {
    logger.warn(
      "Running Sentry plugin from within a `node_modules` folder. Some features may not work."
    );
  }

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

  // Component annotation warning
  if (options.reactComponentAnnotation?.enabled) {
    logger.warn(
      "Component name annotation is not supported in esbuild. Please use a separate transform step or consider using a different bundler."
    );
  }

  const transformReplace = Object.keys(replacementValues).length > 0;

  // Track entry points wrapped for debug ID injection
  const debugIdWrappedPaths = new Set<string>();

  void sentryBuildPluginManager.telemetry.emitBundlerPluginExecutionSignal().catch(() => {
    // Telemetry failures are acceptable
  });

  return {
    name: pluginName,
    setup({ initialOptions, onLoad, onResolve, onEnd }: EsbuildPluginBuild) {
      // Release and/or metadata injection
      if (!staticInjectionCode.isEmpty()) {
        const virtualInjectionFilePath = path.resolve("_sentry-injection-stub");
        initialOptions.inject = initialOptions.inject || [];
        initialOptions.inject.push(virtualInjectionFilePath);

        onResolve({ filter: /_sentry-injection-stub/ }, (args) => {
          return {
            path: args.path,
            sideEffects: true,
            pluginName,
          };
        });

        onLoad({ filter: /_sentry-injection-stub/ }, () => {
          return {
            loader: "js",
            pluginName,
            contents: staticInjectionCode.code(),
          };
        });
      }

      // Bundle size optimizations
      if (transformReplace) {
        const replacementStringValues: Record<string, string> = {};
        Object.entries(replacementValues).forEach(([key, value]) => {
          replacementStringValues[key] = JSON.stringify(value);
        });

        initialOptions.define = { ...initialOptions.define, ...replacementStringValues };
      }

      // Debug ID injection - requires per-entry-point unique IDs
      if (sourcemapsEnabled) {
        // Clear state from previous builds (important for watch mode and test suites)
        debugIdWrappedPaths.clear();

        if (!initialOptions.bundle) {
          logger.warn(
            "The Sentry esbuild plugin only supports esbuild with `bundle: true` being set in the esbuild build options. Esbuild will probably crash now. Sorry about that. If you need to upload sourcemaps without `bundle: true`, it is recommended to use Sentry CLI instead: https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/cli/"
          );
        }

        // Wrap entry points to inject debug IDs
        onResolve({ filter: /.*/ }, (args) => {
          if (args.kind !== "entry-point") {
            return;
          }

          // Skip injecting debug IDs into modules specified in the esbuild `inject` option
          // since they're already part of the entry points
          if (initialOptions.inject?.includes(args.path)) {
            return;
          }

          const resolvedPath = path.isAbsolute(args.path)
            ? args.path
            : path.join(args.resolveDir, args.path);

          // Skip injecting debug IDs into paths that have already been wrapped
          if (debugIdWrappedPaths.has(resolvedPath)) {
            return;
          }
          debugIdWrappedPaths.add(resolvedPath);

          return {
            pluginName,
            path: resolvedPath,
            pluginData: {
              isDebugIdProxy: true,
              originalPath: args.path,
              originalResolveDir: args.resolveDir,
            },
            // We need to add a suffix here, otherwise esbuild will mark the entrypoint as resolved and won't traverse
            // the module tree any further down past the proxy module because we're essentially creating a dependency
            // loop back to the proxy module.
            // By setting a suffix we're telling esbuild that the entrypoint and proxy module are two different things,
            // making it re-resolve the entrypoint when it is imported from the proxy module.
            // Super confusing? Yes. Works? Apparently... Let's see.
            suffix: "?sentryDebugIdProxy=true",
          };
        });

        onLoad({ filter: /.*/ }, (args) => {
          if (!(args.pluginData as { isDebugIdProxy?: boolean })?.isDebugIdProxy) {
            return null;
          }

          const originalPath = (args.pluginData as { originalPath: string }).originalPath;
          const originalResolveDir = (args.pluginData as { originalResolveDir: string })
            .originalResolveDir;

          return {
            loader: "js",
            pluginName,
            contents: `
              import "_sentry-debug-id-injection-stub";
              import * as OriginalModule from ${JSON.stringify(originalPath)};
              export default OriginalModule.default;
              export * from ${JSON.stringify(originalPath)};`,
            resolveDir: originalResolveDir,
          };
        });

        onResolve({ filter: /_sentry-debug-id-injection-stub/ }, (args) => {
          return {
            path: args.path,
            sideEffects: true,
            pluginName,
            namespace: "sentry-debug-id-stub",
            suffix: `?sentry-module-id=${randomUUID()}`,
          };
        });

        onLoad(
          { filter: /_sentry-debug-id-injection-stub/, namespace: "sentry-debug-id-stub" },
          () => {
            return {
              loader: "js",
              pluginName,
              contents: getDebugIdSnippet(randomUUID()).code(),
            };
          }
        );
      }

      // Create release and optionally upload
      const freeGlobalDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();
      const upload = createDebugIdUploadFunction({ sentryBuildPluginManager });

      initialOptions.metafile = true;
      onEnd(async (result) => {
        try {
          await sentryBuildPluginManager.createRelease();

          if (sourcemapsEnabled && options.sourcemaps?.disable !== "disable-upload") {
            const buildArtifacts = result.metafile ? Object.keys(result.metafile.outputs) : [];
            await upload(buildArtifacts);
          }
        } finally {
          freeGlobalDependencyOnBuildArtifacts();
          await sentryBuildPluginManager.deleteArtifacts();
        }
      });
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default sentryEsbuildPlugin;
export type { Options as SentryEsbuildPluginOptions } from "../core";
export { sentryCliBinaryExists } from "../core";
