// PUBLIC APIS

import type { StackParser } from '@sentry/core';
import { consoleSandbox, createStackParser, GLOBAL_OBJ } from '@sentry/core';
import { nodeStackLineParser } from '@sentry/core/server';
import { createGetModuleFromFilename } from '../utils/module';

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

/** Node.js stack parser */
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename()));
