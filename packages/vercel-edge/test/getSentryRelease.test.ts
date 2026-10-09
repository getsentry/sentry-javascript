import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSentryRelease } from '../src/sdk';

// Commit env vars set on CI (e.g. GITHUB_SHA on GitHub Actions) take precedence over the ones tested here.
const HIGHER_PRIORITY_ENV_VARS = [
  'SENTRY_RELEASE',
  'GITHUB_SHA',
  'CI_MERGE_REQUEST_SOURCE_BRANCH_SHA',
  'CI_BUILD_REF',
  'CI_COMMIT_SHA',
  'BITBUCKET_COMMIT',
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getSentryRelease', () => {
  it('ignores a commit env var whose value is its own name', () => {
    for (const key of HIGHER_PRIORITY_ENV_VARS) {
      vi.stubEnv(key, '');
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA');

    expect(getSentryRelease('fallback')).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VERCEL_GIT_COMMIT_SHA'));
  });
});
