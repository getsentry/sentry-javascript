import { diag, DiagLogLevel, propagation, trace } from '@opentelemetry/api';
import type { Client, Integration } from '@sentry/core';
import {
  _INTERNAL_warnIfClientIsActive,
  consoleIntegration,
  consoleSandbox,
  conversationIdIntegration,
  createStackParser,
  debug,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  getCurrentScope,
  getIntegrationsToSetup,
  getVercelEnv,
  GLOBAL_OBJ,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import { nodeStackLineParser } from '@sentry/core/server';
import {
  SentryPropagator,
  SentryTracerProvider,
  setOpenTelemetryContextAsyncContextStrategy,
} from '@sentry/opentelemetry';
import { VercelEdgeClient } from './client';
import { winterCGFetchIntegration } from './integrations/wintercg-fetch';
import { makeEdgeTransport } from './transports';
import type { VercelEdgeOptions } from './types';

declare const process: {
  env: Record<string, string>;
};

const nodeStackParser = createStackParser(nodeStackLineParser());

/** Get the default integrations for the Vercel Edge SDK. */
export function getDefaultIntegrations(): Integration[] {
  return [
    dedupeIntegration(),
    eventFiltersIntegration(),
    functionToStringIntegration(),
    conversationIdIntegration(),
    linkedErrorsIntegration(),
    winterCGFetchIntegration(),
    consoleIntegration(),
    requestDataIntegration(),
  ];
}

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): Client {
  setOpenTelemetryContextAsyncContextStrategy();

  const scope = getCurrentScope();
  scope.update(options.initialScope);

  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations();
  }

  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  if (options.tracesSampleRate === undefined && process.env.SENTRY_TRACES_SAMPLE_RATE) {
    const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const detectedRelease = getSentryRelease();
    if (detectedRelease !== undefined) {
      options.release = detectedRelease;
    }
  }

  options.environment = options.environment || process.env.SENTRY_ENVIRONMENT || getVercelEnv() || process.env.NODE_ENV;

  options.traceLifecycle = options.traceLifecycle ?? getTraceLifecycleFromEnv(process.env.SENTRY_TRACE_LIFECYCLE);

  _INTERNAL_warnIfClientIsActive();

  const client = new VercelEdgeClient({
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || nodeStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeEdgeTransport,
  });
  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);

  client.init();

  // If users opt-out of this, they _have_ to set up OpenTelemetry themselves
  // There is no way to use this SDK without OpenTelemetry!
  if (options.enableOpenTelemetrySetup ?? true) {
    setupOtel(client);
  }

  return client;
}

// exported for tests
// eslint-disable-next-line jsdoc/require-jsdoc
export function setupOtel(client: VercelEdgeClient): void {
  if (client.getOptions().debug) {
    setupOpenTelemetryLogger();
  }

  const provider = new SentryTracerProvider();

  trace.setGlobalTracerProvider(provider);
  propagation.setGlobalPropagator(new SentryPropagator());

  client.traceProvider = provider;
}

/**
 * Setup the OTEL logger to use our own debug logger.
 */
function setupOpenTelemetryLogger(): void {
  // Disable diag, to ensure this works even if called multiple times
  diag.disable();
  diag.setLogger(
    {
      error: debug.error,
      warn: debug.warn,
      info: debug.log,
      debug: debug.log,
      verbose: debug.log,
    },
    DiagLogLevel.DEBUG,
  );
}

/**
 * Returns a release dynamically from environment variables.
 */
// eslint-disable-next-line complexity
export function getSentryRelease(fallback?: string): string | undefined {
  // Always read first as Sentry takes this as precedence
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }

  // This supports the variable that sentry-webpack-plugin injects
  if (GLOBAL_OBJ.SENTRY_RELEASE?.id) {
    return GLOBAL_OBJ.SENTRY_RELEASE.id;
  }

  // This list is in approximate alpha order, separated into 3 categories:
  // 1. Git providers
  // 2. CI providers with specific environment variables (has the provider name in the variable name)
  // 3. CI providers with generic environment variables (checked for last to prevent possible false positives)

  const possibleReleaseNameOfGitProvider =
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    readCommitEnvVar('GITHUB_SHA') ||
    // GitLab CI - https://docs.gitlab.com/ee/ci/variables/predefined_variables.html
    readCommitEnvVar('CI_MERGE_REQUEST_SOURCE_BRANCH_SHA') ||
    readCommitEnvVar('CI_BUILD_REF') ||
    readCommitEnvVar('CI_COMMIT_SHA') ||
    // Bitbucket - https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/
    readCommitEnvVar('BITBUCKET_COMMIT');

  const possibleReleaseNameOfCiProvidersWithSpecificEnvVar =
    // AppVeyor - https://www.appveyor.com/docs/environment-variables/
    readCommitEnvVar('APPVEYOR_PULL_REQUEST_HEAD_COMMIT') ||
    readCommitEnvVar('APPVEYOR_REPO_COMMIT') ||
    // AWS CodeBuild - https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html
    readCommitEnvVar('CODEBUILD_RESOLVED_SOURCE_VERSION') ||
    // AWS Amplify - https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html
    readCommitEnvVar('AWS_COMMIT_ID') ||
    // Azure Pipelines - https://docs.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
    readCommitEnvVar('BUILD_SOURCEVERSION') ||
    // Bitrise - https://devcenter.bitrise.io/builds/available-environment-variables/
    readCommitEnvVar('GIT_CLONE_COMMIT_HASH') ||
    // Buddy CI - https://buddy.works/docs/pipelines/environment-variables#default-environment-variables
    readCommitEnvVar('BUDDY_EXECUTION_REVISION') ||
    // Builtkite - https://buildkite.com/docs/pipelines/environment-variables
    readCommitEnvVar('BUILDKITE_COMMIT') ||
    // CircleCI - https://circleci.com/docs/variables/
    readCommitEnvVar('CIRCLE_SHA1') ||
    // Cirrus CI - https://cirrus-ci.org/guide/writing-tasks/#environment-variables
    readCommitEnvVar('CIRRUS_CHANGE_IN_REPO') ||
    // Codefresh - https://codefresh.io/docs/docs/codefresh-yaml/variables/
    readCommitEnvVar('CF_REVISION') ||
    // Codemagic - https://docs.codemagic.io/yaml-basic-configuration/environment-variables/
    readCommitEnvVar('CM_COMMIT') ||
    // Cloudflare Pages - https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables
    readCommitEnvVar('CF_PAGES_COMMIT_SHA') ||
    // Drone - https://docs.drone.io/pipeline/environment/reference/
    readCommitEnvVar('DRONE_COMMIT_SHA') ||
    // Flightcontrol - https://www.flightcontrol.dev/docs/guides/flightcontrol/environment-variables#built-in-environment-variables
    readCommitEnvVar('FC_GIT_COMMIT_SHA') ||
    // Heroku #1 https://devcenter.heroku.com/articles/heroku-ci
    readCommitEnvVar('HEROKU_TEST_RUN_COMMIT_VERSION') ||
    // Heroku #2 https://devcenter.heroku.com/articles/dyno-metadata#dyno-metadata
    readCommitEnvVar('HEROKU_BUILD_COMMIT') ||
    // Heroku #3 (deprecated by Heroku, kept for backward compatibility)
    readCommitEnvVar('HEROKU_SLUG_COMMIT') ||
    // Railway - https://docs.railway.app/reference/variables#git-variables
    readCommitEnvVar('RAILWAY_GIT_COMMIT_SHA') ||
    // Render - https://render.com/docs/environment-variables
    readCommitEnvVar('RENDER_GIT_COMMIT') ||
    // Semaphore CI - https://docs.semaphoreci.com/ci-cd-environment/environment-variables
    readCommitEnvVar('SEMAPHORE_GIT_SHA') ||
    // TravisCI - https://docs.travis-ci.com/user/environment-variables/#default-environment-variables
    readCommitEnvVar('TRAVIS_PULL_REQUEST_SHA') ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    readCommitEnvVar('VERCEL_GIT_COMMIT_SHA') ||
    readCommitEnvVar('VERCEL_GITHUB_COMMIT_SHA') ||
    readCommitEnvVar('VERCEL_GITLAB_COMMIT_SHA') ||
    readCommitEnvVar('VERCEL_BITBUCKET_COMMIT_SHA') ||
    // Zeit (now known as Vercel)
    readCommitEnvVar('ZEIT_GITHUB_COMMIT_SHA') ||
    readCommitEnvVar('ZEIT_GITLAB_COMMIT_SHA') ||
    readCommitEnvVar('ZEIT_BITBUCKET_COMMIT_SHA');

  const possibleReleaseNameOfCiProvidersWithGenericEnvVar =
    // CloudBees CodeShip - https://docs.cloudbees.com/docs/cloudbees-codeship/latest/pro-builds-and-configuration/environment-variables
    readCommitEnvVar('CI_COMMIT_ID') ||
    // Coolify - https://coolify.io/docs/knowledge-base/environment-variables
    readCommitEnvVar('SOURCE_COMMIT') ||
    // Heroku #3 https://devcenter.heroku.com/changelog-items/630
    readCommitEnvVar('SOURCE_VERSION') ||
    // Jenkins - https://plugins.jenkins.io/git/#environment-variables
    readCommitEnvVar('GIT_COMMIT') ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    readCommitEnvVar('COMMIT_REF') ||
    // TeamCity - https://www.jetbrains.com/help/teamcity/predefined-build-parameters.html
    readCommitEnvVar('BUILD_VCS_NUMBER') ||
    // Woodpecker CI - https://woodpecker-ci.org/docs/usage/environment
    readCommitEnvVar('CI_COMMIT_SHA');

  return (
    possibleReleaseNameOfGitProvider ||
    possibleReleaseNameOfCiProvidersWithSpecificEnvVar ||
    possibleReleaseNameOfCiProvidersWithGenericEnvVar ||
    fallback
  );
}

/**
 * Reads an environment variable that should hold a commit SHA. A value that is the variable's own
 * name, such as `VERCEL_GIT_COMMIT_SHA=VERCEL_GIT_COMMIT_SHA`, is ignored: it never changes, so as
 * a release name it would put every build into one release.
 */
function readCommitEnvVar(name: string): string | undefined {
  const value = process.env[name];
  if (value?.trim() === name) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry] Ignoring the ${name} environment variable as a release name, because its value is its own name. Set the release explicitly, or fix the variable in your build environment.`,
      );
    });
    return undefined;
  }
  return value;
}

function getTraceLifecycleFromEnv(envVar: string | undefined): 'static' | 'stream' | undefined {
  return envVar === 'stream' || envVar === 'static' ? envVar : undefined;
}
