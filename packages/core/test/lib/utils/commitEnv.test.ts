import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReleaseFromCommitEnv, readCommitEnvVar } from '../../../src/utils/commitEnv';

describe('commitEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // CI sets some of these variables (e.g. GITHUB_SHA on GitHub Actions), so start from an empty env.
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('readCommitEnvVar', () => {
    it('returns the value of the variable', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123';

      expect(readCommitEnvVar('VERCEL_GIT_COMMIT_SHA')).toBe('abc123');
    });

    it('returns undefined for an unset or empty variable', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = '';

      expect(readCommitEnvVar('VERCEL_GIT_COMMIT_SHA')).toBeUndefined();
      expect(readCommitEnvVar('GITHUB_SHA')).toBeUndefined();
    });

    it('ignores a value that is its own name and warns by default', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.VERCEL_GIT_COMMIT_SHA = ' VERCEL_GIT_COMMIT_SHA ';

      expect(readCommitEnvVar('VERCEL_GIT_COMMIT_SHA')).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('VERCEL_GIT_COMMIT_SHA'));
    });

    it('passes a placeholder to a custom handler instead of warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onPlaceholder = vi.fn();
      process.env.VERCEL_GIT_COMMIT_SHA = 'VERCEL_GIT_COMMIT_SHA';

      expect(readCommitEnvVar('VERCEL_GIT_COMMIT_SHA', onPlaceholder)).toBeUndefined();
      expect(onPlaceholder).toHaveBeenCalledWith('VERCEL_GIT_COMMIT_SHA');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('getReleaseFromCommitEnv', () => {
    it('returns undefined when no commit variable is set', () => {
      expect(getReleaseFromCommitEnv()).toBeUndefined();
    });

    it('prefers git provider variables over generic CI variables', () => {
      process.env.COMMIT_REF = 'netlify-commit';
      process.env.GITHUB_SHA = 'github-commit';

      expect(getReleaseFromCommitEnv()).toBe('github-commit');
    });

    it('reads HEROKU_BUILD_COMMIT before HEROKU_SLUG_COMMIT', () => {
      process.env.HEROKU_BUILD_COMMIT = 'heroku-build-commit';
      process.env.HEROKU_SLUG_COMMIT = 'heroku-slug-commit';

      expect(getReleaseFromCommitEnv()).toBe('heroku-build-commit');
    });

    it('skips a placeholder and uses the next variable that is set', () => {
      const onPlaceholder = vi.fn();
      process.env.VERCEL_GIT_COMMIT_SHA = 'VERCEL_GIT_COMMIT_SHA';
      process.env.COMMIT_REF = 'netlify-commit';

      expect(getReleaseFromCommitEnv(onPlaceholder)).toBe('netlify-commit');
      expect(onPlaceholder).toHaveBeenCalledWith('VERCEL_GIT_COMMIT_SHA');
    });

    it('does not report a placeholder checked after the variable that supplies the release', () => {
      const onPlaceholder = vi.fn();
      process.env.VERCEL_GIT_COMMIT_SHA = 'vercel-commit';
      process.env.COMMIT_REF = 'COMMIT_REF';

      expect(getReleaseFromCommitEnv(onPlaceholder)).toBe('vercel-commit');
      expect(onPlaceholder).not.toHaveBeenCalled();
    });

    it('reports each placeholder once', () => {
      const onPlaceholder = vi.fn();
      process.env.CI_COMMIT_SHA = 'CI_COMMIT_SHA';

      expect(getReleaseFromCommitEnv(onPlaceholder)).toBeUndefined();
      expect(onPlaceholder).toHaveBeenCalledTimes(1);
    });
  });
});
