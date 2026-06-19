import SentryCli from '@sentry/cli';
import type { Client } from '@sentry/core';
import type { ServerRuntimeClientOptions } from '@sentry/core';
import { applySdkMetadata, ServerRuntimeClient } from '@sentry/core';
import type { NormalizedOptions } from '../options-mapping';
import { SENTRY_SAAS_URL } from '../options-mapping';
import { Scope } from '@sentry/core';
import { createStackParser, nodeStackLineParser } from '@sentry/core';
import { makeOptionallyEnabledNodeTransport } from './transports';
import { getProjects } from '../utils';
import { LIB_VERSION } from '../version';

const SENTRY_SAAS_HOSTNAME = 'sentry.io';

const stackParser = createStackParser(nodeStackLineParser());

export function createSentryInstance(
  options: NormalizedOptions,
  shouldSendTelemetry: Promise<boolean>,
  buildTool: string,
  buildToolMajorVersion: string | undefined,
): { sentryScope: Scope; sentryClient: Client } {
  const clientOptions: ServerRuntimeClientOptions = {
    platform: 'node',
    runtime: { name: 'node', version: global.process.version },

    dsn: 'https://4c2bae7d9fbc413e8f7385f55c515d51@o1.ingest.sentry.io/6690737',

    tracesSampleRate: 1,
    sampleRate: 1,

    release: LIB_VERSION,
    integrations: [],
    tracePropagationTargets: ['sentry.io/api'],

    stackParser,

    beforeSend: event => {
      event.exception?.values?.forEach(exception => {
        delete exception.stacktrace;
      });

      delete event.server_name; // Server name might contain PII
      return event;
    },

    beforeSendTransaction: event => {
      delete event.server_name; // Server name might contain PII
      return event;
    },

    // We create a transport that stalls sending events until we know that we're allowed to (i.e. when Sentry CLI told
    // us that the upload URL is the Sentry SaaS URL)
    transport: makeOptionallyEnabledNodeTransport(shouldSendTelemetry),
  };

  applySdkMetadata(clientOptions, 'node');

  const client = new ServerRuntimeClient(clientOptions);
  const scope = new Scope();
  scope.setClient(client);

  setTelemetryDataOnScope(options, scope, buildTool, buildToolMajorVersion);

  return { sentryScope: scope, sentryClient: client };
}

export function setTelemetryDataOnScope(
  options: NormalizedOptions,
  scope: Scope,
  buildTool: string,
  buildToolMajorVersion?: string,
): void {
  const { org, project, release, errorHandler, sourcemaps, reactComponentAnnotation } = options;

  scope.setTag('upload-legacy-sourcemaps', !!release.uploadLegacySourcemaps);
  if (release.uploadLegacySourcemaps) {
    scope.setTag(
      'uploadLegacySourcemapsEntries',
      Array.isArray(release.uploadLegacySourcemaps) ? release.uploadLegacySourcemaps.length : 1,
    );
  }

  scope.setTag('module-metadata', !!options.moduleMetadata);
  scope.setTag('inject-build-information', !!options._experiments.injectBuildInformation);

  // Optional release pipeline steps
  if (release.setCommits) {
    scope.setTag('set-commits', release.setCommits.auto === true ? 'auto' : 'manual');
  } else {
    scope.setTag('set-commits', 'undefined');
  }
  scope.setTag('finalize-release', release.finalize);
  scope.setTag('deploy-options', !!release.deploy);

  // Miscellaneous options
  scope.setTag('custom-error-handler', !!errorHandler);
  scope.setTag('sourcemaps-assets', !!sourcemaps?.assets);
  scope.setTag('delete-after-upload', !!sourcemaps?.filesToDeleteAfterUpload);
  scope.setTag('sourcemaps-disabled', !!sourcemaps?.disable);

  scope.setTag('react-annotate', !!reactComponentAnnotation?.enabled);

  scope.setTag('node', process.version);
  scope.setTag('platform', process.platform);

  scope.setTag('meta-framework', options._metaOptions.telemetry.metaFramework ?? 'none');

  scope.setTag('application-key-set', options.applicationKey !== undefined);

  scope.setTag('ci', !!process.env['CI']);

  scope.setTags({
    organization: org,
    project: Array.isArray(project) ? project.join(', ') : (project ?? 'undefined'),
    bundler: buildTool,
  });

  if (buildToolMajorVersion) {
    scope.setTag('bundler-major-version', buildToolMajorVersion);
  }

  scope.setUser({ id: org });
}

export async function allowedToSendTelemetry(options: NormalizedOptions): Promise<boolean> {
  const { silent, org, project, authToken, url, headers, telemetry, release } = options;

  // `options.telemetry` defaults to true
  if (telemetry === false) {
    return false;
  }

  if (url === SENTRY_SAAS_URL) {
    return true;
  }

  const cli = new SentryCli(null, {
    url,
    authToken,
    org,
    project: getProjects(project)?.[0],
    vcsRemote: release.vcsRemote,
    silent,
    headers,
  });

  let cliInfo;
  try {
    // Makes a call to SentryCLI to get the Sentry server URL the CLI uses.
    // We need to check and decide to use telemetry based on the CLI's response to this call
    // because only at this time we checked a possibly existing .sentryclirc file. This file
    // could point to another URL than the default URL.
    cliInfo = await cli.execute(['info'], false);
  } catch {
    return false;
  }

  const cliInfoUrl = cliInfo
    .split(/(\r\n|\n|\r)/)[0]
    ?.replace(/^Sentry Server: /, '')
    ?.trim();

  if (cliInfoUrl === undefined) {
    return false;
  }

  return new URL(cliInfoUrl).hostname === SENTRY_SAAS_HOSTNAME;
}

/**
 * Flushing the SDK client can fail. We never want to crash the plugin because of telemetry.
 */
export async function safeFlushTelemetry(sentryClient: Client): Promise<void> {
  try {
    await sentryClient.flush(2000);
  } catch {
    // Noop when flushing fails.
    // We don't even need to log anything because there's likely nothing the user can do and they likely will not care.
  }
}
