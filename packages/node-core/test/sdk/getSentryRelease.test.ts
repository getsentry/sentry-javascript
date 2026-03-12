import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSentryRelease } from '../../src/sdk/api';

// Higher-priority env vars that may be set on CI (e.g. GITHUB_SHA on GitHub Actions)
// and would take precedence over the Heroku vars we're testing.
const HIGHER_PRIORITY_ENV_VARS = [
  'SENTRY_RELEASE',
  'GITHUB_SHA',
  'CI_MERGE_REQUEST_SOURCE_BRANCH_SHA',
  'CI_BUILD_REF',
  'CI_COMMIT_SHA',
  'BITBUCKET_COMMIT',
];

beforeEach(() => {
  for (const key of HIGHER_PRIORITY_ENV_VARS) {
    vi.stubEnv(key, '');
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSentryRelease', () => {
  it('uses HEROKU_BUILD_COMMIT env var', () => {
    vi.stubEnv('HEROKU_BUILD_COMMIT', 'heroku-build-commit-sha');

    expect(getSentryRelease()).toBe('heroku-build-commit-sha');
  });

  it('falls back to HEROKU_SLUG_COMMIT if HEROKU_BUILD_COMMIT is not set', () => {
    vi.stubEnv('HEROKU_SLUG_COMMIT', 'heroku-slug-commit-sha');

    expect(getSentryRelease()).toBe('heroku-slug-commit-sha');
  });

  it('prefers HEROKU_BUILD_COMMIT over HEROKU_SLUG_COMMIT', () => {
    vi.stubEnv('HEROKU_BUILD_COMMIT', 'heroku-build-commit-sha');
    vi.stubEnv('HEROKU_SLUG_COMMIT', 'heroku-slug-commit-sha');

    expect(getSentryRelease()).toBe('heroku-build-commit-sha');
  });
});
