import type { Logger } from "./logger";
import type {
  Options as UserOptions,
  SetCommitsOptions,
  RewriteSourcesHook,
  ResolveSourceMapHook,
  IncludeEntry,
  ModuleMetadata,
  ModuleMetadataCallback,
} from "./types";
import { determineReleaseName } from "./utils";

export type NormalizedOptions = {
  org: string | undefined;
  project: string | string[] | undefined;
  authToken: string | undefined;
  url: string;
  headers: Record<string, string> | undefined;
  debug: boolean;
  silent: boolean;
  errorHandler: ((err: Error) => void) | undefined;
  telemetry: boolean;
  disable: boolean;
  sourcemaps:
    | {
        disable?: boolean | "disable-upload";
        assets?: string | string[];
        ignore?: string | string[];
        rewriteSources?: RewriteSourcesHook;
        resolveSourceMap?: ResolveSourceMapHook;
        filesToDeleteAfterUpload?: string | string[] | Promise<string | string[] | undefined>;
      }
    | undefined;
  release: {
    name: string | undefined;
    inject: boolean;
    create: boolean;
    finalize: boolean;
    vcsRemote: string;
    setCommits:
      | (SetCommitsOptions & {
          shouldNotThrowOnFailure?: boolean;
        })
      | false
      | undefined;
    dist?: string;
    deploy?:
      | {
          env: string;
          started?: number | string;
          finished?: number | string;
          time?: number;
          name?: string;
          url?: string;
        }
      | false;
    uploadLegacySourcemaps?: string | IncludeEntry | Array<string | IncludeEntry>;
  };
  bundleSizeOptimizations:
    | {
        excludeDebugStatements?: boolean;
        excludeTracing?: boolean;
        excludeReplayCanvas?: boolean;
        excludeReplayShadowDom?: boolean;
        excludeReplayIframe?: boolean;
        excludeReplayWorker?: boolean;
      }
    | undefined;
  reactComponentAnnotation:
    | {
        enabled?: boolean;
        ignoredComponents?: string[];
        _experimentalInjectIntoHtml?: boolean;
      }
    | undefined;
  _metaOptions: {
    telemetry: {
      metaFramework: string | undefined;
    };
  };
  applicationKey: string | undefined;
  moduleMetadata: ModuleMetadata | ModuleMetadataCallback | undefined;
  _experiments: {
    injectBuildInformation?: boolean;
  } & Record<string, unknown>;
};

export const SENTRY_SAAS_URL = "https://sentry.io";

// oxlint-disable-next-line complexity
export function normalizeUserOptions(userOptions: UserOptions): NormalizedOptions {
  const options = {
    org: userOptions.org ?? process.env["SENTRY_ORG"],
    project:
      userOptions.project ??
      (process.env["SENTRY_PROJECT"]?.includes(",")
        ? process.env["SENTRY_PROJECT"].split(",").map((p) => p.trim())
        : process.env["SENTRY_PROJECT"]),
    authToken: userOptions.authToken ?? process.env["SENTRY_AUTH_TOKEN"],
    url: userOptions.url ?? process.env["SENTRY_URL"] ?? SENTRY_SAAS_URL,
    headers: userOptions.headers,
    debug: userOptions.debug ?? false,
    silent: userOptions.silent ?? false,
    errorHandler: userOptions.errorHandler,
    telemetry: userOptions.telemetry ?? true,
    disable: userOptions.disable ?? false,
    sourcemaps: userOptions.sourcemaps,
    release: {
      ...userOptions.release,
      name: userOptions.release?.name ?? process.env["SENTRY_RELEASE"] ?? determineReleaseName(),
      inject: userOptions.release?.inject ?? true,
      create: userOptions.release?.create ?? true,
      finalize: userOptions.release?.finalize ?? true,
      vcsRemote: userOptions.release?.vcsRemote ?? process.env["SENTRY_VSC_REMOTE"] ?? "origin",
      setCommits: userOptions.release?.setCommits as
        | (SetCommitsOptions & { shouldNotThrowOnFailure?: boolean })
        | false
        | undefined,
    },
    bundleSizeOptimizations: userOptions.bundleSizeOptimizations,
    reactComponentAnnotation: userOptions.reactComponentAnnotation,
    _metaOptions: {
      telemetry: {
        metaFramework: userOptions._metaOptions?.telemetry?.metaFramework,
        bundlerMajorVersion: userOptions._metaOptions?.telemetry?.bundlerMajorVersion,
      },
    },
    applicationKey: userOptions.applicationKey,
    moduleMetadata: userOptions.moduleMetadata,
    _experiments: userOptions._experiments ?? {},
  };

  if (options.release.setCommits === undefined) {
    if (
      process.env["VERCEL"] &&
      process.env["VERCEL_GIT_COMMIT_SHA"] &&
      process.env["VERCEL_GIT_REPO_SLUG"] &&
      process.env["VERCEL_GIT_REPO_OWNER"] &&
      // We only want to set commits for the production env because Sentry becomes extremely noisy (eg on slack) for
      // preview environments because the previous commit is always the "stem" commit of the preview/PR causing Sentry
      // to notify you for other people creating PRs.
      process.env["VERCEL_TARGET_ENV"] === "production"
    ) {
      options.release.setCommits = {
        shouldNotThrowOnFailure: true,
        commit: process.env["VERCEL_GIT_COMMIT_SHA"],
        previousCommit: process.env["VERCEL_GIT_PREVIOUS_SHA"],
        repo: `${process.env["VERCEL_GIT_REPO_OWNER"]}/${process.env["VERCEL_GIT_REPO_SLUG"]}`,
        ignoreEmpty: true,
        ignoreMissing: true,
      };
    } else {
      options.release.setCommits = {
        shouldNotThrowOnFailure: true,
        auto: true,
        ignoreEmpty: true,
        ignoreMissing: true,
      };
    }
  }

  if (
    options.release.deploy === undefined &&
    process.env["VERCEL"] &&
    process.env["VERCEL_TARGET_ENV"]
  ) {
    options.release.deploy = {
      env: `vercel-${process.env["VERCEL_TARGET_ENV"]}`,
      url: process.env["VERCEL_URL"] ? `https://${process.env["VERCEL_URL"]}` : undefined,
    };
  }

  return options;
}

/**
 * Validates a few combinations of options that are not checked by Sentry CLI.
 *
 * For all other options, we can rely on Sentry CLI to validate them. In fact,
 * we can't validate them in the plugin because Sentry CLI might pick up options from
 * its config file.
 *
 * @param options the internal options
 * @param logger the logger
 *
 * @returns `true` if the options are valid, `false` otherwise
 */
export function validateOptions(options: NormalizedOptions, logger: Logger): boolean {
  const setCommits = options.release?.setCommits;
  if (setCommits) {
    if (!setCommits.auto && !(setCommits.repo && setCommits.commit)) {
      logger.error(
        "The `setCommits` option was specified but is missing required properties.",
        "Please set either `auto` or both, `repo` and `commit`."
      );
      return false;
    }
    if (setCommits.auto && setCommits.repo && setCommits) {
      logger.warn(
        "The `setCommits` options includes `auto` but also `repo` and `commit`.",
        "Ignoring `repo` and `commit`.",
        "Please only set either `auto` or both, `repo` and `commit`."
      );
    }
  }

  if (
    options.release?.deploy &&
    typeof options.release.deploy === "object" &&
    !options.release.deploy.env
  ) {
    logger.error(
      "The `deploy` option was specified but is missing the required `env` property.",
      "Please set the `env` property."
    );
    return false;
  }

  if (options.project && Array.isArray(options.project)) {
    if (options.project.length === 0) {
      logger.error(
        "The `project` option was specified as an array but is empty.",
        "Please provide at least one project slug."
      );
      return false;
    }
    // Check each project is a non-empty string
    const invalidProjects = options.project.filter((p) => typeof p !== "string" || p.trim() === "");
    if (invalidProjects.length > 0) {
      logger.error(
        "The `project` option contains invalid project slugs.",
        "All projects must be non-empty strings."
      );
      return false;
    }
  }

  return true;
}
