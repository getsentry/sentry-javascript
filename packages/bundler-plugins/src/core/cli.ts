import { createSentrySDK } from 'sentry';
import type { NormalizedOptions } from './options-mapping';
import type { SetCommitsOptions } from './types';
import { arrayify, getProjects } from './utils';

type SentrySDK = ReturnType<typeof createSentrySDK>;

/** Comma-joined list of ignore globs, or `undefined` when nothing should be ignored. */
function serializeIgnore(ignore: string | string[] | undefined): string | undefined {
  if (!ignore) {
    return undefined;
  }
  const patterns = arrayify(ignore);
  return patterns.length > 0 ? patterns.join(',') : undefined;
}

/**
 * The CLI's `SENTRY_CUSTOM_HEADERS` format: semicolon-separated `Name: Value` pairs. A value
 * that contains the separator would be split into a bogus second header, so it is rejected.
 */
export function serializeCustomHeaders(headers: Record<string, string>): string | undefined {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return undefined;
  }
  for (const [name, value] of entries) {
    if (/[;\r\n]/.test(value)) {
      throw new Error(`Invalid value for header "${name}": it must not contain ";" or line breaks.`);
    }
  }
  return entries.map(([name, value]) => `${name}: ${value}`).join('; ');
}

/** A single sourcemap directory to upload plus the flags that apply to it. */
interface UploadTarget {
  directory: string;
  dist?: string;
  ext?: string[];
  ignore?: string | string[];
  ignoreFile?: string;
  urlPrefix?: string;
}

/**
 * Thin wrapper around the Sentry CLI's programmatic SDK. The bundler plugin used to drive the
 * old `@sentry/cli` binary through a `SentryCli` class; the new CLI exposes typed methods via
 * `createSentrySDK()` instead. This adapter maps the plugin's structured option shapes onto
 * those methods and keeps all translation logic in one place.
 */
export class SentryCliAdapter {
  readonly #options: NormalizedOptions;
  /** Client for every command that is not scoped to a specific project. */
  readonly #sdk: SentrySDK;

  public constructor(options: NormalizedOptions) {
    this.#options = options;
    this.#sdk = this.#createClient();
  }

  /**
   * The CLI binds `org`/`project`/`url` when the client is created rather than per call, so a
   * client scoped to a different project needs to be a different client.
   *
   * Creating one is free: it reads no config and opens no connection, it only closes over these
   * options. Everything happens when a command is actually invoked.
   */
  #createClient(project?: string): SentrySDK {
    // The SDK forwards `token` as `SENTRY_AUTH_TOKEN`, but its auth precedence is: this flag, then a
    // stored `sentry auth login`, then the env token. Without the flag, a developer's personal login
    // silently replaces the configured token. The SDK only consults `process.env` when a command
    // runs, so setting it here is enough; with no configured token nothing changes.
    // TODO: Remove once https://github.com/getsentry/cli/issues/1463 is fixed in the minimum CLI version.
    if (this.#options.authToken) {
      process.env['SENTRY_FORCE_ENV_TOKEN'] = '1';
    }

    // `createSentrySDK` has no `headers` option yet, but the CLI reads `SENTRY_CUSTOM_HEADERS`
    // from `process.env` on every request. The CLI only applies them to self-hosted URLs.
    // TODO: Remove once https://github.com/getsentry/cli/pull/1465 is in the minimum CLI version and pass
    // `headers` to `createSentrySDK` instead.
    const customHeaders = this.#options.headers && serializeCustomHeaders(this.#options.headers);
    if (customHeaders) {
      process.env['SENTRY_CUSTOM_HEADERS'] = customHeaders;
    }

    return createSentrySDK({
      token: this.#options.authToken,
      org: this.#options.org,
      project,
      url: this.#options.url,
    });
  }

  /** Create a release and associate it with the configured project(s). */
  public async createRelease(name: string): Promise<unknown> {
    // Sentry rejects a release without projects, and the unscoped client carries none.
    return this.#sdk.release.create({ orgVersion: name, project: getProjects(this.#options.project)?.join(',') });
  }

  /** Finalize a release by stamping an end timestamp. */
  public async finalizeRelease(name: string): Promise<void> {
    await this.#sdk.release.finalize({ orgVersion: name });
  }

  /**
   * Associate commits with a release. Translates the plugin's {@link SetCommitsOptions} `auto` /
   * `repo`+`commit` union into the flags accepted by `sentry release set-commits`. The old CLI's
   * `ignoreMissing`/`ignoreEmpty` toggles have no equivalent flag on the new CLI; the caller's
   * `shouldNotThrowOnFailure` handling still swallows the "no repository" failure case.
   */
  public async setCommits(name: string, setCommitsOptions: SetCommitsOptions): Promise<void> {
    const { auto, repo, commit, previousCommit } = setCommitsOptions;

    // Manual mode is expressed as `REPO@SHA` (optionally `REPO@PREV..SHA`).
    const commitSpec =
      repo && commit ? `${repo}@${previousCommit ? `${previousCommit}..${commit}` : commit}` : undefined;

    await this.#sdk.release['set-commits']({
      orgVersion: name,
      auto: auto === true,
      commit: commitSpec,
    });
  }

  /** Create a deploy for a release. */
  public async newDeploy(name: string, deploy: NonNullable<NormalizedOptions['release']['deploy']>): Promise<void> {
    if (deploy === false) {
      return;
    }

    await this.#sdk.release.deploy({
      orgVersion: name,
      environment: deploy.env,
      name: deploy.name,
      url: deploy.url,
      started: deploy.started !== undefined ? String(deploy.started) : undefined,
      finished: deploy.finished !== undefined ? String(deploy.finished) : undefined,
      time: deploy.time !== undefined ? String(deploy.time) : undefined,
    });
  }

  /**
   * Upload sourcemaps for one or more directories. The old CLI accepted a structured `include`
   * array; the new `sourcemap upload` command takes a single directory, so we upload each target
   * separately. A client is created per project because project selection is bound at client
   * creation time.
   */
  public async uploadSourcemaps(name: string, targets: UploadTarget[]): Promise<void> {
    const projects = getProjects(this.#options.project) ?? [undefined];

    for (const project of projects) {
      const sdk = this.#createClient(project);
      for (const target of targets) {
        await sdk.sourcemap.upload({
          directory: target.directory,
          release: name,
          dist: target.dist ?? this.#options.release.dist,
          ext: target.ext?.join(','),
          ignore: serializeIgnore(target.ignore),
          ignoreFile: target.ignoreFile,
          urlPrefix: target.urlPrefix,
        });
      }
    }
  }

  /** Inject debug IDs into the given build artifacts. */
  public async injectDebugIds(directories: string[], ignore: string | string[] | undefined): Promise<void> {
    // Preserve the previous CLI's default of ignoring `node_modules` when nothing else is configured.
    const serializedIgnore = serializeIgnore(ignore) ?? 'node_modules';
    for (const directory of directories) {
      await this.#sdk.sourcemap.inject({ directory, ignore: serializedIgnore });
    }
  }

  /**
   * Resolve the Sentry server URL the CLI is configured to talk to. Used by the telemetry guard
   * to decide whether the current build targets Sentry SaaS. Returns `undefined` on error.
   */
  public async getServerUrl(): Promise<string | undefined> {
    try {
      const info = (await this.#sdk.run('info')) as { config?: { url?: string } };
      return info.config?.url;
    } catch {
      return undefined;
    }
  }
}
