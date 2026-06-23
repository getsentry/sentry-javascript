/* oxlint-disable max-lines */
import SentryCli from '@sentry/cli';
import { closeSession, DEFAULT_ENVIRONMENT, getTraceData, makeSession, setMeasurement, startSpan } from '@sentry/core';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { NormalizedOptions } from './options-mapping';
import { normalizeUserOptions, validateOptions } from './options-mapping';
import type { Logger } from './logger';
import { createLogger } from './logger';
import { allowedToSendTelemetry, createSentryInstance, safeFlushTelemetry } from './sentry/telemetry';
import type { Options, SentrySDKBuildFlags } from './types';
import {
  arrayify,
  getProjects,
  getTurborepoEnvPassthroughWarning,
  serializeIgnoreOptions,
  stripQueryAndHashFromPath,
} from './utils';
import { defaultRewriteSourcesHook, prepareBundleForDebugIdUpload } from './debug-id-upload';
import { globFiles } from './glob';
import { LIB_VERSION } from './version';

// Module-level guard to prevent duplicate deploy records when multiple bundler plugin
// instances run in the same process (e.g. Next.js creates separate webpack compilers
// for client, server, and edge). Keyed by release name.
const _deployedReleases = new Set<string>();

/** @internal Exported for testing only. */
export function _resetDeployedReleasesForTesting(): void {
  _deployedReleases.clear();
}

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
  uploadSourcemaps(buildArtifactPaths: string[], opts?: { prepareArtifacts?: boolean }): Promise<void>;

  /**
   * Will delete artifacts based on the passed `sourcemaps.filesToDeleteAfterUpload` option.
   */
  deleteArtifacts(): Promise<void>;

  createDependencyOnBuildArtifacts: () => () => void;
};

function createCliInstance(options: NormalizedOptions): SentryCli {
  return new SentryCli(null, {
    authToken: options.authToken,
    org: options.org,
    // Default to the first project if multiple projects are specified
    project: getProjects(options.project)?.[0],
    silent: options.silent,
    url: options.url,
    vcsRemote: options.release.vcsRemote,
    headers: {
      ...(options.telemetry ? getTraceData() : {}),
      ...options.headers,
    },
  });
}

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
      uploadSourcemaps: async () => {
        /* noop */
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

      try {
        const cliInstance = createCliInstance(options);

        if (options.release.create) {
          const releaseOutput = await cliInstance.releases.new(options.release.name);
          logger.debug('Release created:', releaseOutput);
        }

        if (options.release.uploadLegacySourcemaps) {
          const normalizedInclude = arrayify(options.release.uploadLegacySourcemaps)
            .map(includeItem => (typeof includeItem === 'string' ? { paths: [includeItem] } : includeItem))
            .map(includeEntry => ({
              ...includeEntry,
              validate: includeEntry.validate ?? false,
              ext: includeEntry.ext
                ? includeEntry.ext.map(extension => `.${extension.replace(/^\./, '')}`)
                : ['.js', '.map', '.jsbundle', '.bundle'],
              ignore: includeEntry.ignore ? arrayify(includeEntry.ignore) : undefined,
            }));

          await cliInstance.releases.uploadSourceMaps(options.release.name, {
            include: normalizedInclude,
            dist: options.release.dist,
            projects: getProjects(options.project),
            // We want this promise to throw if the sourcemaps fail to upload so that we know about it.
            // see: https://github.com/getsentry/sentry-cli/pull/2605
            live: 'rejectOnError',
          });
        }

        if (options.release.setCommits !== false) {
          try {
            await cliInstance.releases.setCommits(
              options.release.name,
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
          await cliInstance.releases.finalize(options.release.name);
        }

        if (options.release.deploy && !_deployedReleases.has(options.release.name)) {
          await cliInstance.releases.newDeploy(options.release.name, options.release.deploy);
          _deployedReleases.add(options.release.name);
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
      await startSpan({ name: 'inject-debug-ids', scope: sentryScope, forceTransaction: true }, async () => {
        try {
          const cliInstance = createCliInstance(options);
          await cliInstance.execute(
            ['sourcemaps', 'inject', ...serializeIgnoreOptions(options.sourcemaps?.ignore), ...buildArtifactPaths],
            options.debug ? 'rejectOnError' : false,
          );
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
    async uploadSourcemaps(buildArtifactPaths: string[], opts?: { prepareArtifacts?: boolean }) {
      if (!canUploadSourceMaps(options, logger, isDevMode)) {
        return;
      }

      // Early exit if assets is explicitly set to an empty array
      const assets = options.sourcemaps?.assets;
      if (Array.isArray(assets) && assets.length === 0) {
        logger.debug('Empty `sourcemaps.assets` option provided. Will not upload sourcemaps with debug ID.');
        return;
      }

      await startSpan(
        // This is `forceTransaction`ed because this span is used in dashboards in the form of indexed transactions.
        { name: 'debug-id-sourcemap-upload', scope: sentryScope, forceTransaction: true },
        async () => {
          // If we're not using a temp folder, we must not prepare artifacts in-place (to avoid mutating user files)
          const shouldPrepare = opts?.prepareArtifacts ?? true;

          let folderToCleanUp: string | undefined;

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

              const ignorePaths = options.sourcemaps?.ignore
                ? Array.isArray(options.sourcemaps?.ignore)
                  ? options.sourcemaps?.ignore
                  : [options.sourcemaps?.ignore]
                : [];
              await startSpan({ name: 'upload', scope: sentryScope }, async () => {
                const cliInstance = createCliInstance(options);
                await cliInstance.releases.uploadSourceMaps(options.release.name ?? 'undefined', {
                  include: [
                    {
                      paths: pathsToUpload,
                      rewrite: true,
                      dist: options.release.dist,
                    },
                  ],
                  ignore: ignorePaths,
                  projects: getProjects(options.project),
                  live: 'rejectOnError',
                });
              });

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

              const globResult = await startSpan(
                { name: 'glob', scope: sentryScope },
                async () => await globFiles(globAssets, { ignore: options.sourcemaps?.ignore }),
              );

              const debugIdChunkFilePaths = globResult.filter(debugIdChunkFilePath => {
                return !!stripQueryAndHashFromPath(debugIdChunkFilePath).match(/\.(js|mjs|cjs)$/);
              });

              // The order of the files output by glob() is not deterministic
              // Ensure order within the files so that {debug-id}-{chunkIndex} coupling is consistent
              debugIdChunkFilePaths.sort();

              if (debugIdChunkFilePaths.length === 0) {
                logger.warn(
                  "Didn't find any matching sources for debug ID upload. Please check the `sourcemaps.assets` option.",
                );
              } else {
                const tmpUploadFolder = await startSpan({ name: 'mkdtemp', scope: sentryScope }, async () => {
                  return (
                    process.env?.['SENTRY_TEST_OVERRIDE_TEMP_DIR'] ||
                    (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sentry-bundler-plugin-upload-')))
                  );
                });
                folderToCleanUp = tmpUploadFolder;

                // Prepare into temp folder, then upload
                await startSpan({ name: 'prepare-bundles', scope: sentryScope }, async prepBundlesSpan => {
                  // Preparing the bundles can be a lot of work and doing it all at once has the potential of nuking the heap so
                  // instead we do it with a maximum of 16 concurrent workers
                  const preparationTasks = debugIdChunkFilePaths.map((chunkFilePath, chunkIndex) => async () => {
                    await prepareBundleForDebugIdUpload(
                      chunkFilePath,
                      tmpUploadFolder,
                      chunkIndex,
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

                  await startSpan({ name: 'upload', scope: sentryScope }, async () => {
                    const cliInstance = createCliInstance(options);
                    await cliInstance.releases.uploadSourceMaps(options.release.name ?? 'undefined', {
                      include: [
                        {
                          paths: [tmpUploadFolder],
                          rewrite: false,
                          dist: options.release.dist,
                        },
                      ],
                      projects: getProjects(options.project),
                      live: 'rejectOnError',
                    });
                  });
                });

                logger.info('Successfully uploaded source maps to Sentry');
              }
            }
          } catch (e) {
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

function canUploadSourceMaps(options: NormalizedOptions, logger: Logger, isDevMode: boolean): boolean {
  if (options.sourcemaps?.disable) {
    logger.debug('Source map upload was disabled. Will not upload sourcemaps using debug ID process.');
    return false;
  }
  if (isDevMode) {
    logger.debug('Running in development mode. Will not upload sourcemaps.');
    return false;
  }
  if (!options.authToken) {
    logger.warn(
      `No auth token provided. Will not upload source maps. Please set the \`authToken\` option. You can find information on how to generate a Sentry auth token here: https://docs.sentry.io/api/auth/${getTurborepoEnvPassthroughWarning('SENTRY_AUTH_TOKEN')}`,
    );
    return false;
  }
  if (!options.org && !options.authToken.startsWith('sntrys_')) {
    logger.warn(
      `No org provided. Will not upload source maps. Please set the \`org\` option to your Sentry organization slug.${getTurborepoEnvPassthroughWarning('SENTRY_ORG')}`,
    );
    return false;
  }
  if (!getProjects(options.project)?.[0]) {
    logger.warn(
      `No project provided. Will not upload source maps. Please set the \`project\` option to your Sentry project slug.${getTurborepoEnvPassthroughWarning('SENTRY_PROJECT')}`,
    );
    return false;
  }

  return true;
}
