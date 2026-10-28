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

function clearHigherPriorityEnvVars(): void {
  for (const key of HIGHER_PRIORITY_ENV_VARS) {
    vi.stubEnv(key, '');
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getSentryRelease', () => {
  it('ignores a commit env var whose value is its own name', () => {
    clearHigherPriorityEnvVars();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_SHA');

    expect(getSentryRelease('fallback')).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VERCEL_GIT_COMMIT_SHA'));
  });

  it('does not warn about a placeholder checked after the variable that supplies the release', () => {
    clearHigherPriorityEnvVars();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'vercel-commit-sha');
    vi.stubEnv('COMMIT_REF', 'COMMIT_REF');

    expect(getSentryRelease('fallback')).toBe('vercel-commit-sha');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once about a CI_COMMIT_SHA placeholder', () => {
    clearHigherPriorityEnvVars();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('CI_COMMIT_SHA', 'CI_COMMIT_SHA');

    expect(getSentryRelease('fallback')).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
