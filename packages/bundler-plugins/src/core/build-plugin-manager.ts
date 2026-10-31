/* oxlint-disable max-lines */
import { closeSession, DEFAULT_ENVIRONMENT, makeSession, setMeasurement, startSpan } from '@sentry/core';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SentryCliAdapter } from './cli';
import type { NormalizedOptions } from './options-mapping';
import { normalizeUserOptions, validateOptions } from './options-mapping';
import type { Logger } from './logger';
import { createLogger } from './logger';
import { allowedToSendTelemetry, createSentryInstance, safeFlushTelemetry } from './sentry/telemetry';
import type { Options, SentrySDKBuildFlags } from './types';
import { arrayify, getProjects, getTurborepoEnvPassthroughWarning, stripQueryAndHashFromPath } from './utils';
import {
  defaultRewriteSourcesHook,
  prepareArtifactForUpload,
  prepareBundleForDebugIdUpload,
  writePreparedArtifact,
} from './debug-id-upload';
import { globFiles } from './glob';
import type { SourceMapDecision, SourceMapKind } from './sourcemap-settings';
import { decideSourceMapHandling } from './sourcemap-settings';
import type { UploadFilter } from './upload-filter';
import { createUploadFilter } from './upload-filter';
import { LIB_VERSION } from './version';

// Module-level guard to prevent duplicate deploy records when multiple bundler plugin
// instances run in the same process (e.g. Next.js creates separate webpack compilers
// for client, server, and edge). Keyed by release name.
const _deployedReleases = new Set<string>();

/** @internal Exported for testing only. */
export function _resetDeployedReleasesForTesting(): void {
  _deployedReleases.clear();
}

/**
 * A temporary folder that build artifacts are written into straight from the bundler's output,
 * before the bundler writes them to disk. The upload reads from this folder, so the bundler can
 * drop the source map assets from its own output.
 */
export type UploadStaging = {
  readonly dir: string;
  /** Number of artifacts written so far. */
  readonly count: number;
  /**
   * Absolute paths of the chunks staged so far (`mapDir` joined with the file name). The upload
   * does not prepare these again from disk, where a stale map of an earlier build could sit
   * next to them.
   */
  readonly stagedChunkPaths: ReadonlySet<string>;
  /**
   * Stamps the debug ID into the chunk and its source map and writes both into the folder.
   *
   * `mapSource` is `undefined` when the chunk has no separate source map. `mapDir` is the directory
   * the map would be written to and is passed to the `rewriteSources` hook. `chunkPath` is where
   * the chunk is written; `sourcemaps.assets` and `sourcemaps.ignore` are matched against it.
   */
  stage(input: {
    code: string;
    mapSource: string | undefined;
    mapDir: string;
    chunkPath: string;
  }): Promise<'staged' | 'skipped' | 'excluded' | 'failed'>;
  /** Removes the folder. Call this when no upload will consume it. */
  discard(): Promise<void>;
  /**
   * Keeps the folder and logs how to upload it by hand. Call this when the bundler already
   * dropped the staged source maps from its output but the upload did not run. Removes the
   * folder instead when nothing was staged.
   */
  keep(reason: string): Promise<void>;
};

export type SentryBuildPluginManager = {
  /**
   * A logger instance that takes the options passed to the build plugin manager into account. (for silencing and log level etc.)
   */
  logger: Logger;

  /**
   * Options after normalization. Includes things like the inferred release name.
   */
  normalizedOptions: NormalizedOptions;
  /**
   * Magic strings and their replacement values that can be used for bundle size optimizations. This already takes
   * into account the options passed to the build plugin manager.
   */
  bundleSizeOptimizationReplacementValues: SentrySDKBuildFlags;
  /**
   * Metadata that should be injected into bundles if possible. Takes into account options passed to the build plugin manager.
   */
  // See `generateModuleMetadataInjectorCode` for how this should be used exactly
  bundleMetadata: Record<string, unknown>;

  /**
   * Contains utility functions for emitting telemetry via the build plugin manager.
   */
  telemetry: {
    /**
     * Emits a `Sentry Bundler Plugin execution` signal.
     */
    emitBundlerPluginExecutionSignal(): Promise<void>;
  };

  /**
   * Will potentially create a release based on the build plugin manager options.
   *
   * Also
   * - finalizes the release
   * - sets commits
   * - uploads legacy sourcemaps
   * - adds deploy information
   */
  createRelease(): Promise<void>;

  /**
   * Injects debug IDs into the build artifacts.
   *
   * This is a separate function from `uploadSourcemaps` because that needs to run before the sourcemaps are uploaded.
   * Usually the respective bundler-plugin will take care of this before the sourcemaps are uploaded.
   * Only use this if you need to manually inject debug IDs into the build artifacts.
   */
  injectDebugIds(buildArtifactPaths: string[]): Promise<void>;

  /**
   * Uploads sourcemaps using the "Debug ID" method. This function takes a list of build artifact paths that will be uploaded
   */
  uploadSourcemaps(
    buildArtifactPaths: string[],
    opts?: { prepareArtifacts?: boolean; staging?: UploadStaging },
  ): Promise<{ uploaded: boolean }>;

  /**
   * Creates a staging folder that `uploadSourcemaps` uploads together with the build artifacts
   * found on disk, in both the prepared and the direct (`prepareArtifacts: false`) mode.
   */
  createUploadStaging(): Promise<UploadStaging>;

  sourceMaps: {
    /**
     * Whether a source map upload can run with the current options and environment.
     */
    uploadPossible: boolean;
    /**
     * Decides how the plugin treats the user's source map setting (see `decideSourceMapHandling`).
     * Logs the decision's message once per message, unless `log` is `false`.
     */
    decide(kind: SourceMapKind, options?: { log?: boolean }): SourceMapDecision;
    /** Logs the decision's message, once per message. */
    logDecision(decision: SourceMapDecision): void;
    /**
     * Whether a file of the build output is uploaded, for files that are not on disk yet. Mirrors
     * the glob of the upload from disk: it must match `sourcemaps.assets` (all files when unset)
     * and none of `sourcemaps.ignore`.
     */
    shouldUpload: UploadFilter;
  };

  /**
   * Will delete artifacts based on the passed `sourcemaps.filesToDeleteAfterUpload` option.
   */
  deleteArtifacts(): Promise<void>;

  createDependencyOnBuildArtifacts: () => () => void;
};

/**
 * Creates a build plugin manager that exposes primitives for everything that a Sentry JavaScript SDK or build tooling may do during a build.
 *
 * The build plugin manager's behavior strongly depends on the options that are passed in.
 */
export function createSentryBuildPluginManager(
  userOptions: Options,
  bundlerPluginMetaContext: {
    /**
     * E.g. `webpack` or `nextjs` or `turbopack`
     */
    buildTool: string;
    /**
     * E.g. `5` for webpack v5 or `4` for Rollup v4
     */
    buildToolMajorVersion?: string;
    /**
     * E.g. `[sentry-webpack-plugin]` or `[@sentry/nextjs]`
     */
    loggerPrefix: string;
  },
): SentryBuildPluginManager {
  const logger = createLogger({
    prefix: bundlerPluginMetaContext.loggerPrefix,
    silent: userOptions.silent ?? false,
    debug: userOptions.debug ?? false,
  });

  try {
    const dotenvFile = fs.readFileSync(path.join(process.cwd(), '.env.sentry-build-plugin'), 'utf-8');
    // NOTE: Do not use the dotenv.config API directly to read the dotenv file! For some ungodly reason, it falls back to reading `${process.cwd()}/.env` which is absolutely not what we want.
    const dotenvResult = dotenv.parse(dotenvFile);

    // Vite has a bug/behaviour where spreading into process.env will cause it to crash
    // https://github.com/vitest-dev/vitest/issues/1870#issuecomment-1501140251
    Object.assign(process.env, dotenvResult);

    logger.info('Using environment variables configured in ".env.sentry-build-plugin".');
  } catch (e: unknown) {
    // Ignore "file not found" errors but throw all others
    if (typeof e === 'object' && e && 'code' in e && e.code !== 'ENOENT') {
      throw e;
    }
  }

  const options = normalizeUserOptions(userOptions);

  if (options.disable) {
    // Early-return a noop build plugin manager instance so that we
    // don't continue validating options, setting up Sentry, etc.
    // Otherwise we might create side-effects or log messages that
    // users don't expect from a disabled plugin.
    return {
      normalizedOptions: options,
      logger,
      bundleSizeOptimizationReplacementValues: {},
      telemetry: {
        emitBundlerPluginExecutionSignal: async () => {
          /* noop */
        },
      },
      bundleMetadata: {},
      createRelease: async () => {
        /* noop */
      },
      uploadSourcemaps: async () => ({ uploaded: false }),
      createUploadStaging: async () => ({
        dir: '',
        count: 0,
        stagedChunkPaths: new Set<string>(),
        stage: async () => 'skipped' as const,
        discard: async () => {
          /* noop */
        },
        keep: async () => {
          /* noop */
        },
      }),
      sourceMaps: {
        uploadPossible: false,
        decide: () => ({ enableHidden: false, deleteAfterUpload: false }),
        logDecision: () => undefined,
        shouldUpload: () => false,
      },
      deleteArtifacts: async () => {
        /* noop */
      },
      createDependencyOnBuildArtifacts: () => () => {
        /* noop */
      },
      injectDebugIds: async () => {
        /* noop */
      },
    };
  }

  const shouldSendTelemetry = allowedToSendTelemetry(options);
  const { sentryScope, sentryClient } = createSentryInstance(
    options,
    shouldSendTelemetry,
    bundlerPluginMetaContext.buildTool,
    bundlerPluginMetaContext.buildToolMajorVersion,
  );

  const { release, environment = DEFAULT_ENVIRONMENT } = sentryClient.getOptions();

  const sentrySession = makeSession({ release, environment });
  sentryScope.setSession(sentrySession);
  // Send the start of the session
  sentryClient.captureSession(sentrySession);

  let sessionHasEnded = false; // Just to prevent infinite loops with beforeExit, which is called whenever the event loop empties out

  function endSession(): void {
    if (sessionHasEnded) {
      return;
    }

    closeSession(sentrySession);
    sentryClient.captureSession(sentrySession);
    sessionHasEnded = true;
  }

  // We also need to manually end sessions on errors because beforeExit is not called on crashes
  process.on('beforeExit', () => {
    endSession();
  });

  // Set the User-Agent that Sentry CLI will use when interacting with Sentry
  process.env['SENTRY_PIPELINE'] = `${bundlerPluginMetaContext.buildTool}-plugin/${LIB_VERSION}`;

  // Propagate debug flag to Sentry CLI via environment variable
  // Only set if not already defined to respect user's explicit configuration
  if (options.debug && !process.env['SENTRY_LOG_LEVEL']) {
    process.env['SENTRY_LOG_LEVEL'] = 'debug';
  }

  // Not a bulletproof check but should be good enough to at least sometimes determine
  // if the plugin is called in dev/watch mode or for a  prod build. The important part
  // here is to avoid a false positive. False negatives are okay.
  const isDevMode = process.env['NODE_ENV'] === 'development';

  /**
   * Handles errors caught and emitted in various areas of the plugin.
   *
   * Also sets the sentry session status according to the error handling.
   *
   * If users specify their custom `errorHandler` we'll leave the decision to throw
   * or continue up to them. By default, @param throwByDefault controls if the plugin
   * should throw an error (which causes a build fail in most bundlers) or continue.
   */
  function handleRecoverableError(unknownError: unknown, throwByDefault: boolean): void {
    sentrySession.status = 'abnormal';
    try {
      if (options.errorHandler) {
        try {
          if (unknownError instanceof Error) {
            options.errorHandler(unknownError);
          } else {
            options.errorHandler(new Error('An unknown error occurred'));
          }
        } catch (e) {
          sentrySession.status = 'crashed';
          throw e;
        }
      } else {
        // setting the session to "crashed" b/c from a plugin perspective this run failed.
        // However, we're intentionally not rethrowing the error to avoid breaking the user build.
        sentrySession.status = 'crashed';
        if (throwByDefault) {
          throw unknownError;
        }
        logger.error("An error occurred. Couldn't finish all operations:", unknownError);
      }
    } finally {
      endSession();
    }
  }

  if (!validateOptions(options, logger)) {
    // Throwing by default to avoid a misconfigured plugin going unnoticed.
    handleRecoverableError(new Error('Options were not set correctly. See output above for more details.'), true);
  }

  // We have multiple plugins depending on generated source map files. (debug ID upload, legacy upload)
  // Additionally, we also want to have the functionality to delete files after uploading sourcemaps.
  // All of these plugins and the delete functionality need to run in the same hook (`writeBundle`).
  // Since the plugins among themselves are not aware of when they run and finish, we need a system to
  // track their dependencies on the generated files, so that we can initiate the file deletion only after
  // nothing depends on the files anymore.
  const dependenciesOnBuildArtifacts = new Set<symbol>();
  const buildArtifactsDependencySubscribers: (() => void)[] = [];

  function notifyBuildArtifactDependencySubscribers(): void {
    buildArtifactsDependencySubscribers.forEach(subscriber => {
      subscriber();
    });
  }

  function createDependencyOnBuildArtifacts(): () => void {
    const dependencyIdentifier = Symbol();
    dependenciesOnBuildArtifacts.add(dependencyIdentifier);

    return function freeDependencyOnBuildArtifacts() {
      dependenciesOnBuildArtifacts.delete(dependencyIdentifier);
      notifyBuildArtifactDependencySubscribers();
    };
  }

  const sourceMapUploadPossible = getSourceMapUploadBlocker(options, isDevMode) === undefined;
  const loggedSourceMapMessages = new Set<string>();
  const shouldUpload = createUploadFilter(options);

  function logDecision(decision: SourceMapDecision): void {
    if (decision.log && !loggedSourceMapMessages.has(decision.log.message)) {
      loggedSourceMapMessages.add(decision.log.message);
      logger[decision.log.level](decision.log.message);
    }
  }

  /**
   * Returns a Promise that resolves when all the currently active dependencies are freed again.
   *
   * It is very important that this function is called as late as possible before wanting to await the Promise to give
   * the dependency producers as much time as possible to register themselves.
   */
  function waitUntilBuildArtifactDependenciesAreFreed(): Promise<void> {
    return new Promise<void>(resolve => {
      buildArtifactsDependencySubscribers.push(() => {
        if (dependenciesOnBuildArtifacts.size === 0) {
          resolve();
        }
      });

      if (dependenciesOnBuildArtifacts.size === 0) {
        resolve();
      }
    });
  }

  const bundleSizeOptimizationReplacementValues: SentrySDKBuildFlags = {};
  if (options.bundleSizeOptimizations) {
    const { bundleSizeOptimizations } = options;

    if (bundleSizeOptimizations.excludeDebugStatements) {
      bundleSizeOptimizationReplacementValues['__SENTRY_DEBUG__'] = false;
    }
    if (bundleSizeOptimizations.excludeTracing) {
      bundleSizeOptimizationReplacementValues['__SENTRY_TRACING__'] = false;
    }
    if (bundleSizeOptimizations.excludeChannelInjection) {
      bundleSizeOptimizationReplacementValues['__SENTRY_CHANNEL_INJECTION__'] = false;
    }
    if (bundleSizeOptimizations.excludeReplayCanvas) {
      bundleSizeOptimizationReplacementValues['__RRWEB_EXCLUDE_CANVAS__'] = true;
    }
    if (bundleSizeOptimizations.excludeReplayIframe) {
      bundleSizeOptimizationReplacementValues['__RRWEB_EXCLUDE_IFRAME__'] = true;
    }
    if (bundleSizeOptimizations.excludeReplayShadowDom) {
      bundleSizeOptimizationReplacementValues['__RRWEB_EXCLUDE_SHADOW_DOM__'] = true;
    }
    if (bundleSizeOptimizations.excludeReplayWorker) {
      bundleSizeOptimizationReplacementValues['__SENTRY_EXCLUDE_REPLAY_WORKER__'] = true;
    }
  }

  let bundleMetadata: Record<string, unknown> = {};
  if (options.moduleMetadata || options.applicationKey) {
    if (options.applicationKey) {
      // We use different keys so that if user-code receives multiple bundling passes, we will store the application keys of all the passes.
      // It is a bit unfortunate that we have to inject the metadata snippet at the top, because after multiple
      // injections, the first injection will always "win" because it comes last in the code. We would generally be
      // fine with making the last bundling pass win. But because it cannot win, we have to use a workaround of storing
      // the app keys in different object keys.
      // We can simply use the `_sentryBundlerPluginAppKey:` to filter for app keys in the SDK.
      bundleMetadata[`_sentryBundlerPluginAppKey:${options.applicationKey}`] = true;
    }

    if (typeof options.moduleMetadata === 'function') {
      const args = {
        org: options.org,
        project: getProjects(options.project)?.[0],
        projects: getProjects(options.project),
        release: options.release.name,
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      bundleMetadata = { ...bundleMetadata, ...options.moduleMetadata(args) };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      bundleMetadata = { ...bundleMetadata, ...options.moduleMetadata };
    }
  }

  return {
    /**
     * A logger instance that takes the options passed to the build plugin manager into account. (for silencing and log level etc.)
     */
    logger,

    /**
     * Options after normalization. Includes things like the inferred release name.
     */
    normalizedOptions: options,

    /**
     * Magic strings and their replacement values that can be used for bundle size optimizations. This already takes
     * into account the options passed to the build plugin manager.
     */
    bundleSizeOptimizationReplacementValues,

    /**
     * Metadata that should be injected into bundles if possible. Takes into account options passed to the build plugin manager.
     */
    // See `generateModuleMetadataInjectorCode` for how this should be used exactly
    bundleMetadata,

    /**
     * Contains utility functions for emitting telemetry via the build plugin manager.
     */
    telemetry: {
      /**
       * Emits a `Sentry Bundler Plugin execution` signal.
       */
      async emitBundlerPluginExecutionSignal() {
        if (await shouldSendTelemetry) {
          logger.info(
            'Sending telemetry data on issues and performance to Sentry. To disable telemetry, set `options.telemetry` to `false`.',
          );
          startSpan({ name: 'Sentry Bundler Plugin execution', scope: sentryScope }, () => {
            //
          });
          await safeFlushTelemetry(sentryClient);
        }
      },
    },

    /**
     * Will potentially create a release based on the build plugin manager options.
     *
     * Also
     * - finalizes the release
     * - sets commits
     * - uploads legacy sourcemaps
     * - adds deploy information
     */
    async createRelease() {
      if (!options.release.name) {
        logger.debug(
          'No release name provided. Will not create release. Please set the `release.name` option to identify your release.',
        );
        return;
      } else if (isDevMode) {
        logger.debug('Running in development mode. Will not create release.');
        return;
      } else if (!options.authToken) {
        logger.warn(
          `No auth token provided. Will not create release. Please set the \`authToken\` option. You can find information on how to generate a Sentry auth token here: https://docs.sentry.io/api/auth/${getTurborepoEnvPassthroughWarning('SENTRY_AUTH_TOKEN')}`,
        );
        return;
      } else if (!options.org && !options.authToken.startsWith('sntrys_')) {
        logger.warn(
          `No organization slug provided. Will not create release. Please set the \`org\` option to your Sentry organization slug.${getTurborepoEnvPassthroughWarning('SENTRY_ORG')}`,
        );
        return;
      } else if (!options.project || (Array.isArray(options.project) && options.project.length === 0)) {
        logger.warn(
          `No project provided. Will not create release. Please set the \`project\` option to your Sentry project slug.${getTurborepoEnvPassthroughWarning('SENTRY_PROJECT')}`,
        );
        return;
      }

      // It is possible that this writeBundle hook is called multiple times in one build (for example when reusing the plugin, or when using build tooling like `@vitejs/plugin-legacy`)
      // Therefore we need to actually register the execution of this hook as dependency on the sourcemap files.
      const freeWriteBundleInvocationDependencyOnSourcemapFiles = createDependencyOnBuildArtifacts();

      // Guaranteed to be set by the guard clause above.
      const releaseName = options.release.name;

      try {
        const cliInstance = new SentryCliAdapter(options);

        if (options.release.create) {
          const releaseOutput = await cliInstance.createRelease(releaseName);
          logger.debug('Release created:', releaseOutput);
        }

        if (options.release.uploadLegacySourcemaps) {
          const uploadTargets = arrayify(options.release.uploadLegacySourcemaps)
            .map(includeItem => (typeof includeItem === 'string' ? { paths: [includeItem] } : includeItem))
            .flatMap(includeEntry =>
              includeEntry.paths.map(directory => ({
                directory,
                dist: options.release.dist,
                ext: includeEntry.ext
                  ? includeEntry.ext.map(extension => `.${extension.replace(/^\./, '')}`)
                  : ['.js', '.map', '.jsbundle', '.bundle'],
                // The old CLI only skipped `node_modules` when neither ignore source was configured.
                ignore: includeEntry.ignore
                  ? arrayify(includeEntry.ignore)
                  : includeEntry.ignoreFile
                    ? undefined
                    : ['node_modules'],
                ignoreFile: includeEntry.ignoreFile,
                urlPrefix: includeEntry.urlPrefix,
              })),
            );

          await cliInstance.uploadSourcemaps(releaseName, uploadTargets);
        }

        if (options.release.setCommits !== false) {
          try {
            await cliInstance.setCommits(
              releaseName,
              // set commits always exists due to the normalize function
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              options.release.setCommits!,
            );
          } catch (e) {
            // shouldNotThrowOnFailure being present means that the plugin defaulted to `{ auto: true }` for the setCommitsOptions, meaning that wee should not throw when CLI throws because there is no repo
            if (
              options.release.setCommits &&
              'shouldNotThrowOnFailure' in options.release.setCommits &&
              options.release.setCommits.shouldNotThrowOnFailure
            ) {
              logger.debug(
                'An error occurred setting commits on release (this message can be ignored unless you commits on release are desired):',
                e,
              );
            } else {
              throw e;
            }
          }
        }

        if (options.release.finalize) {
          await cliInstance.finalizeRelease(releaseName);
        }

        if (options.release.deploy && !_deployedReleases.has(releaseName)) {
          await cliInstance.newDeploy(releaseName, options.release.deploy);
          _deployedReleases.add(releaseName);
        }
      } catch (e) {
        sentryScope.captureException('Error in "releaseManagementPlugin" writeBundle hook');
        await safeFlushTelemetry(sentryClient);
        handleRecoverableError(e, false);
      } finally {
        freeWriteBundleInvocationDependencyOnSourcemapFiles();
      }
    },

    /*
      Injects debug IDs into the build artifacts.

      This is a separate function from `uploadSourcemaps` because that needs to run before the sourcemaps are uploaded.
      Usually the respective bundler-plugin will take care of this before the sourcemaps are uploaded.
      Only use this if you need to manually inject debug IDs into the build artifacts.
    */
    async injectDebugIds(buildArtifactPaths: string[]) {
      // oxlint-disable-next-line typescript/no-deprecated
      await startSpan({ name: 'inject-debug-ids', scope: sentryScope, forceTransaction: true }, async () => {
        try {
          const cliInstance = new SentryCliAdapter(options);
          await cliInstance.injectDebugIds(buildArtifactPaths, options.sourcemaps?.ignore);
        } catch (e) {
          sentryScope.captureException('Error in "debugIdInjectionPlugin" writeBundle hook');
          handleRecoverableError(e, false);
        } finally {
          await safeFlushTelemetry(sentryClient);
        }
      });
    },

    /**
     * Uploads sourcemaps using the "Debug ID" method.
     *
     * By default, this prepares bundles in a temporary folder before uploading. You can opt into an
     * in-place, direct upload path by setting `prepareArtifacts` to `false`. If `prepareArtifacts` is set to
     * `false`, no preparation (e.g. adding `//# debugId=...` and writing adjusted source maps) is performed and no temp folder is used.
     *
     * @param buildArtifactPaths - The paths of the build artifacts to upload
     * @param opts - Optional flags to control temp folder usage and preparation
     */
    async uploadSourcemaps(
      buildArtifactPaths: string[],
      opts?: { prepareArtifacts?: boolean; staging?: UploadStaging },
    ): Promise<{ uploaded: boolean }> {
      const staging = opts?.staging;

      if (!canUploadSourceMaps(options, logger, isDevMode)) {
        await staging?.discard();
        return { uploaded: false };
      }

      const assets = options.sourcemaps?.assets;
      let uploaded = false;

      await startSpan(
        // This is `forceTransaction`ed because this span is used in dashboards in the form of indexed transactions.
        // oxlint-disable-next-line typescript/no-deprecated
        { name: 'debug-id-sourcemap-upload', scope: sentryScope, forceTransaction: true },
        async () => {
          // If we're not using a temp folder, we must not prepare artifacts in-place (to avoid mutating user files)
          const shouldPrepare = opts?.prepareArtifacts ?? true;

          let folderToCleanUp: string | undefined = staging?.dir;

          // It is possible that this writeBundle hook (which calls this function) is called multiple times in one build (for example when reusing the plugin, or when using build tooling like `@vitejs/plugin-legacy`)
          // Therefore we need to actually register the execution of this hook as dependency on the sourcemap files.
          const freeUploadDependencyOnBuildArtifacts = createDependencyOnBuildArtifacts();

          try {
            if (!shouldPrepare) {
              // Direct CLI upload from existing artifact paths (no globbing, no preparation)
              let pathsToUpload: string[];

              if (assets) {
                pathsToUpload = Array.isArray(assets) ? assets : [assets];
                logger.debug(
                  `Direct upload mode: passing user-provided assets directly to CLI: ${pathsToUpload.join(', ')}`,
                );
              } else {
                // Use original paths e.g. like ['.next/server'] directly –> preferred way when no globbing is done
                pathsToUpload = buildArtifactPaths;
              }

              // Staged artifacts are already prepared, so the CLI can take the folder as it is.
              if (staging && staging.count > 0) {
                pathsToUpload = [...pathsToUpload, staging.dir];
              }

              if (pathsToUpload.length === 0) {
                logger.warn(
                  "Didn't find any matching sources for debug ID upload. Please check the `sourcemaps.assets` option.",
                );
                return;
              }

              await startSpan({ name: 'upload', scope: sentryScope }, async () => {
                const cliInstance = new SentryCliAdapter(options);
                await cliInstance.uploadSourcemaps(
                  options.release.name ?? 'undefined',
                  pathsToUpload.map(directory => ({
                    directory,
                    dist: options.release.dist,
                    ignore: options.sourcemaps?.ignore,
                  })),
                );
              });

              uploaded = true;
              logger.info('Successfully uploaded source maps to Sentry');
            } else {
              // Prepare artifacts in temp folder before uploading
              let globAssets: string | string[];
              if (assets) {
                globAssets = assets;
              } else {
                logger.debug(
                  'No `sourcemaps.assets` option provided, falling back to uploading detected build artifacts.',
                );
                globAssets = buildArtifactPaths;
              }

              const globResult = await startSpan({ name: 'glob', scope: sentryScope }, async () =>
                globFiles(globAssets, { ignore: options.sourcemaps?.ignore }),
              );

              const debugIdChunkFilePaths = globResult.filter(debugIdChunkFilePath => {
                const filePath = stripQueryAndHashFromPath(debugIdChunkFilePath);
                return !!filePath.match(/\.(js|mjs|cjs)$/) && !staging?.stagedChunkPaths.has(path.resolve(filePath));
              });

              // The order of the files output by glob() is not deterministic
              // Ensure order within the files so that {debug-id}-{chunkIndex} coupling is consistent
              debugIdChunkFilePaths.sort();

              const stagedCount = staging?.count ?? 0;

              if (debugIdChunkFilePaths.length === 0 && stagedCount === 0) {
                logger.warn(
                  "Didn't find any matching sources for debug ID upload. Please check the `sourcemaps.assets` option.",
                );
              } else {
                const tmpUploadFolder =
                  staging?.dir ??
                  (await startSpan({ name: 'mkdtemp', scope: sentryScope }, () => createTempUploadFolder()));
                folderToCleanUp = tmpUploadFolder;

                // Prepare into temp folder, then upload
                await startSpan({ name: 'prepare-bundles', scope: sentryScope }, async prepBundlesSpan => {
                  // Preparing the bundles can be a lot of work and doing it all at once has the potential of nuking the heap so
                  // instead we do it with a maximum of 16 concurrent workers
                  const preparationTasks = debugIdChunkFilePaths.map((chunkFilePath, chunkIndex) => async () => {
                    await prepareBundleForDebugIdUpload(
                      chunkFilePath,
                      tmpUploadFolder,
                      stagedCount + chunkIndex,
                      logger,
                      options.sourcemaps?.rewriteSources ?? defaultRewriteSourcesHook,
                      options.sourcemaps?.resolveSourceMap,
                    );
                  });
                  const workers: Promise<void>[] = [];
                  const worker = async (): Promise<void> => {
                    while (preparationTasks.length > 0) {
                      const task = preparationTasks.shift();
                      if (task) {
                        await task();
                      }
                    }
                  };
                  for (let workerIndex = 0; workerIndex < 16; workerIndex++) {
                    workers.push(worker());
                  }

                  await Promise.all(workers);

                  const files = await fs.promises.readdir(tmpUploadFolder);
                  const stats = files.map(file => fs.promises.stat(path.join(tmpUploadFolder, file)));
                  const uploadSize = (await Promise.all(stats)).reduce(
                    (accumulator, { size }) => accumulator + size,
                    0,
                  );

                  setMeasurement('files', files.length, 'none', prepBundlesSpan);
                  setMeasurement('upload_size', uploadSize, 'byte', prepBundlesSpan);

                  // Preparation produced no artifacts, meaning none of the
                  // matched bundles had an associated source map. This almost
                  // always means source map generation is turned off in the
                  // bundler, so warn instead of silently reporting success.
                  if (files.length === 0) {
                    logger.warn(
                      `No source maps found for any of the ${debugIdChunkFilePaths.length + stagedCount} matched build ` +
                        'artifacts, so no source maps were uploaded to Sentry. This usually means source map ' +
                        'generation is not enabled in your bundler. Enable it so Sentry can un-minify your stack traces.',
                    );
                    return;
                  }

                  await startSpan({ name: 'upload', scope: sentryScope }, async () => {
                    const cliInstance = new SentryCliAdapter(options);
                    await cliInstance.uploadSourcemaps(options.release.name ?? 'undefined', [
                      {
                        directory: tmpUploadFolder,
                        dist: options.release.dist,
                      },
                    ]);
                  });

                  // this must be in the method so that the "no sourcemaps"
                  // early return doesn't also log success.
                  uploaded = true;
                  logger.info('Successfully uploaded source maps to Sentry');
                });
              }
            }
          } catch (e) {
            if (staging && folderToCleanUp) {
              await staging.keep('Source map upload failed.');
              folderToCleanUp = undefined;
            }
            sentryScope.captureException('Error in "debugIdUploadPlugin" writeBundle hook');
            handleRecoverableError(e, false);
          } finally {
            if (folderToCleanUp && !process.env?.['SENTRY_TEST_OVERRIDE_TEMP_DIR']) {
              logger.debug('Cleaning up temporary files...');
              try {
                await startSpan({ name: 'cleanup', scope: sentryScope }, async () => {
                  if (folderToCleanUp) {
                    await fs.promises.rm(folderToCleanUp, { recursive: true, force: true });
                    logger.debug(`Temporary folder deleted: ${folderToCleanUp}`);
                  }
                });
              } catch (e) {
                // A failed cleanup must not skip the teardown steps below (freeing upload
                // dependencies, flushing telemetry), so swallow and log instead of rethrowing.
                logger.debug('Failed to clean up temporary folder:', e);
              }
            }
            logger.debug('Freeing upload dependencies...');
            freeUploadDependencyOnBuildArtifacts();
            logger.debug('Flushing telemetry data...');
            await safeFlushTelemetry(sentryClient);
            logger.debug('Telemetry flushed. Plugin upload process complete.');
          }
        },
      );

      return { uploaded };
    },

    async createUploadStaging(): Promise<UploadStaging> {
      const dir = await createTempUploadFolder();
      const rewriteSourcesHook = options.sourcemaps?.rewriteSources ?? defaultRewriteSourcesHook;
      let count = 0;
      let discarded = false;
      const stagedChunkPaths = new Set<string>();

      const discard = async (): Promise<void> => {
        if (discarded) {
          return;
        }
        discarded = true;

        if (process.env['SENTRY_TEST_OVERRIDE_TEMP_DIR']) {
          return;
        }

        try {
          await fs.promises.rm(dir, { recursive: true, force: true });
        } catch (e) {
          logger.debug(`Failed to remove staging folder ${dir}:`, e);
        }
      };

      return {
        dir,
        get count() {
          return count;
        },
        stagedChunkPaths,
        async stage(input) {
          const chunkPath = path.resolve(input.chunkPath);
          const chunkName = path.basename(chunkPath);
          if (!shouldUpload(chunkPath)) {
            logger.debug(
              `Not staging ${chunkName} for upload: excluded by \`sourcemaps.assets\` or \`sourcemaps.ignore\`.`,
            );
            return 'excluded';
          }

          const result = prepareArtifactForUpload({
            code: input.code,
            mapSource: input.mapSource,
            mapDir: input.mapDir,
            rewriteSourcesHook,
          });

          if (!result.ok) {
            logger.debug(`Not staging ${chunkName} for upload: ${result.reason}`);
            return 'skipped';
          }

          const index = count++;

          try {
            await writePreparedArtifact(dir, `${result.artifact.debugId}-${index}`, result.artifact);
            stagedChunkPaths.add(chunkPath);
            return 'staged';
          } catch (e) {
            sentryScope.captureException('Error staging build artifact for upload');
            // Throwing by default: the bundler drops the source map from its
            // output once staged, so a lost copy would leave no map at all.
            handleRecoverableError(e, true);
            return 'failed';
          }
        },
        discard,
        async keep(reason) {
          if (count === 0) {
            await discard();
            return;
          }
          if (discarded) {
            return;
          }
          discarded = true;

          // The bundler dropped the staged source maps from its output, so
          // this folder is the only copy left.
          logger.error(
            `${reason} The source maps were kept in ${dir}. Upload them with \`sentry sourcemap upload ${dir}\`.`,
          );
        },
      };
    },

    sourceMaps: {
      uploadPossible: sourceMapUploadPossible,
      decide(kind, { log = true } = {}) {
        const decision = decideSourceMapHandling(kind, options, sourceMapUploadPossible);
        if (log) {
          logDecision(decision);
        }
        return decision;
      },
      logDecision,
      shouldUpload,
    },

    /**
     * Will delete artifacts based on the passed `sourcemaps.filesToDeleteAfterUpload` option.
     */
    async deleteArtifacts() {
      try {
        const filesToDelete = await options.sourcemaps?.filesToDeleteAfterUpload;
        if (filesToDelete !== undefined) {
          const filePathsToDelete = await globFiles(filesToDelete);

          logger.debug('Waiting for dependencies on generated files to be freed before deleting...');

          await waitUntilBuildArtifactDependenciesAreFreed();

          filePathsToDelete.forEach(filePathToDelete => {
            logger.debug(`Deleting asset after upload: ${filePathToDelete}`);
          });

          await Promise.all(
            filePathsToDelete.map(filePathToDelete =>
              fs.promises.rm(filePathToDelete, { force: true }).catch(e => {
                // This is allowed to fail - we just don't do anything
                logger.debug(`An error occurred while attempting to delete asset: ${filePathToDelete}`, e);
              }),
            ),
          );
        }
      } catch (e) {
        sentryScope.captureException('Error in "sentry-file-deletion-plugin" buildEnd hook');
        await safeFlushTelemetry(sentryClient);
        // We throw by default if we get here b/c not being able to delete
        // source maps could leak them to production
        handleRecoverableError(e, true);
      }
    },
    createDependencyOnBuildArtifacts,
  };
}

async function createTempUploadFolder(): Promise<string> {
  return (
    process.env['SENTRY_TEST_OVERRIDE_TEMP_DIR'] ||
    (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sentry-bundler-plugin-upload-')))
  );
}

type SourceMapUploadBlocker = 'disabled' | 'no-assets' | 'dev-mode' | 'no-auth-token' | 'no-org' | 'no-project';

function getSourceMapUploadBlocker(options: NormalizedOptions, isDevMode: boolean): SourceMapUploadBlocker | undefined {
  if (options.sourcemaps?.disable) {
    return 'disabled';
  }
  if (Array.isArray(options.sourcemaps?.assets) && options.sourcemaps.assets.length === 0) {
    return 'no-assets';
  }
  if (isDevMode) {
    return 'dev-mode';
  }
  if (!options.authToken) {
    return 'no-auth-token';
  }
  if (!options.org && !options.authToken.startsWith('sntrys_')) {
    return 'no-org';
  }
  if (!getProjects(options.project)?.[0]) {
    return 'no-project';
  }
  return undefined;
}

function canUploadSourceMaps(options: NormalizedOptions, logger: Logger, isDevMode: boolean): boolean {
  switch (getSourceMapUploadBlocker(options, isDevMode)) {
    case 'disabled':
      logger.debug('Source map upload was disabled. Will not upload sourcemaps using debug ID process.');
      return false;
    case 'no-assets':
      logger.debug('Empty `sourcemaps.assets` option provided. Will not upload sourcemaps with debug ID.');
      return false;
    case 'dev-mode':
      logger.debug('Running in development mode. Will not upload sourcemaps.');
      return false;
    case 'no-auth-token':
      logger.warn(
        `No auth token provided. Will not upload source maps. Please set the \`authToken\` option. You can find information on how to generate a Sentry auth token here: https://docs.sentry.io/api/auth/${getTurborepoEnvPassthroughWarning('SENTRY_AUTH_TOKEN')}`,
      );
      return false;
    case 'no-org':
      logger.warn(
        `No org provided. Will not upload source maps. Please set the \`org\` option to your Sentry organization slug.${getTurborepoEnvPassthroughWarning('SENTRY_ORG')}`,
      );
      return false;
    case 'no-project':
      logger.warn(
        `No project provided. Will not upload source maps. Please set the \`project\` option to your Sentry project slug.${getTurborepoEnvPassthroughWarning('SENTRY_PROJECT')}`,
      );
      return false;
    default:
      return true;
  }
}
