import { consoleSandbox } from './debug-logger';

/**
 * Environment variables that CI and hosting providers set to the commit being built, in the order
 * release detection checks them. The list is in approximate alpha order, separated into 3 categories:
 * 1. Git providers
 * 2. CI providers with specific environment variables (has the provider name in the variable name)
 * 3. CI providers with generic environment variables (checked for last to prevent possible false positives)
 */
const COMMIT_ENV_VARS = [
  // 1. Git providers
  // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
  'GITHUB_SHA',
  // GitLab CI - https://docs.gitlab.com/ee/ci/variables/predefined_variables.html
  // Woodpecker CI also sets CI_COMMIT_SHA - https://woodpecker-ci.org/docs/usage/environment
  'CI_MERGE_REQUEST_SOURCE_BRANCH_SHA',
  'CI_BUILD_REF',
  'CI_COMMIT_SHA',
  // Bitbucket - https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/
  'BITBUCKET_COMMIT',

  // 2. CI providers with specific environment variables
  // AppVeyor - https://www.appveyor.com/docs/environment-variables/
  'APPVEYOR_PULL_REQUEST_HEAD_COMMIT',
  'APPVEYOR_REPO_COMMIT',
  // AWS CodeBuild - https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html
  'CODEBUILD_RESOLVED_SOURCE_VERSION',
  // AWS Amplify - https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html
  'AWS_COMMIT_ID',
  // Azure Pipelines - https://docs.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
  'BUILD_SOURCEVERSION',
  // Bitrise - https://devcenter.bitrise.io/builds/available-environment-variables/
  'GIT_CLONE_COMMIT_HASH',
  // Buddy CI - https://buddy.works/docs/pipelines/environment-variables#default-environment-variables
  'BUDDY_EXECUTION_REVISION',
  // Builtkite - https://buildkite.com/docs/pipelines/environment-variables
  'BUILDKITE_COMMIT',
  // CircleCI - https://circleci.com/docs/variables/
  'CIRCLE_SHA1',
  // Cirrus CI - https://cirrus-ci.org/guide/writing-tasks/#environment-variables
  'CIRRUS_CHANGE_IN_REPO',
  // Codefresh - https://codefresh.io/docs/docs/codefresh-yaml/variables/
  'CF_REVISION',
  // Codemagic - https://docs.codemagic.io/yaml-basic-configuration/environment-variables/
  'CM_COMMIT',
  // Cloudflare Pages - https://developers.cloudflare.com/pages/platform/build-configuration/#environment-variables
  'CF_PAGES_COMMIT_SHA',
  // Drone - https://docs.drone.io/pipeline/environment/reference/
  'DRONE_COMMIT_SHA',
  // Flightcontrol - https://www.flightcontrol.dev/docs/guides/flightcontrol/environment-variables#built-in-environment-variables
  'FC_GIT_COMMIT_SHA',
  // Heroku #1 https://devcenter.heroku.com/articles/heroku-ci
  'HEROKU_TEST_RUN_COMMIT_VERSION',
  // Heroku #2 https://devcenter.heroku.com/articles/dyno-metadata#dyno-metadata
  'HEROKU_BUILD_COMMIT',
  // Heroku #3 (deprecated by Heroku, kept for backward compatibility)
  'HEROKU_SLUG_COMMIT',
  // Railway - https://docs.railway.app/reference/variables#git-variables
  'RAILWAY_GIT_COMMIT_SHA',
  // Render - https://render.com/docs/environment-variables
  'RENDER_GIT_COMMIT',
  // Semaphore CI - https://docs.semaphoreci.com/ci-cd-environment/environment-variables
  'SEMAPHORE_GIT_SHA',
  // TravisCI - https://docs.travis-ci.com/user/environment-variables/#default-environment-variables
  'TRAVIS_PULL_REQUEST_SHA',
  // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_GITHUB_COMMIT_SHA',
  'VERCEL_GITLAB_COMMIT_SHA',
  'VERCEL_BITBUCKET_COMMIT_SHA',
  // Zeit (now known as Vercel)
  'ZEIT_GITHUB_COMMIT_SHA',
  'ZEIT_GITLAB_COMMIT_SHA',
  'ZEIT_BITBUCKET_COMMIT_SHA',

  // 3. CI providers with generic environment variables
  // CloudBees CodeShip - https://docs.cloudbees.com/docs/cloudbees-codeship/latest/pro-builds-and-configuration/environment-variables
  'CI_COMMIT_ID',
  // Coolify - https://coolify.io/docs/knowledge-base/environment-variables
  'SOURCE_COMMIT',
  // Heroku #4 https://devcenter.heroku.com/changelog-items/630
  'SOURCE_VERSION',
  // Jenkins - https://plugins.jenkins.io/git/#environment-variables
  'GIT_COMMIT',
  // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
  'COMMIT_REF',
  // TeamCity - https://www.jetbrains.com/help/teamcity/predefined-build-parameters.html
  'BUILD_VCS_NUMBER',
] as const;

/** Called with the name of a commit environment variable whose value is its own name. */
export type PlaceholderCommitEnvVarHandler = (name: string) => void;

function warnAboutPlaceholderCommitEnvVar(name: string): void {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Ignoring the ${name} environment variable as a release name, because its value is its own name. Set the release explicitly, or fix the variable in your build environment.`,
    );
  });
}

/**
 * Reads an environment variable that should hold a commit SHA. A value that is the variable's own
 * name, such as `VERCEL_GIT_COMMIT_SHA=VERCEL_GIT_COMMIT_SHA`, is ignored: it never changes, so as
 * a release name it would put every build into one release. `onPlaceholder` is called for such a
 * value and warns on the console by default.
 */
export function readCommitEnvVar(
  name: string,
  onPlaceholder: PlaceholderCommitEnvVarHandler = warnAboutPlaceholderCommitEnvVar,
): string | undefined {
  if (typeof process === 'undefined') {
    return undefined;
  }
  const value = process.env[name];
  if (value?.trim() === name) {
    onPlaceholder(name);
    return undefined;
  }
  return value || undefined;
}

/**
 * Returns the commit that CI or the hosting provider is building, read from the first of the known
 * commit environment variables that is set. Variables are read in order and only until one is
 * found, so a placeholder value is only reported when it would otherwise have become the release.
 */
export function getReleaseFromCommitEnv(
  onPlaceholder: PlaceholderCommitEnvVarHandler = warnAboutPlaceholderCommitEnvVar,
): string | undefined {
  for (const name of COMMIT_ENV_VARS) {
    const value = readCommitEnvVar(name, onPlaceholder);
    if (value) {
      return value;
    }
  }
  return undefined;
}
