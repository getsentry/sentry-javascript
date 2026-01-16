import { describe, expect, it } from 'vitest';
import { getFinalOptions } from '../src/options';

describe('getFinalOptions', () => {
  it('returns user options when env is not an object', () => {
    const userOptions = { dsn: 'test-dsn', release: 'test-release' };
    const env = 'not-an-object';

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual(userOptions);
  });

  it('returns user options when env is null', () => {
    const userOptions = { dsn: 'test-dsn', release: 'test-release' };
    const env = null;

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual(userOptions);
  });

  it('merges options from env with user options', () => {
    const userOptions = { dsn: 'test-dsn', release: 'user-release' };
    const env = { SENTRY_RELEASE: 'env-release' };

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual({ dsn: 'test-dsn', release: 'user-release' });
  });

  it('uses user options when SENTRY_RELEASE exists but is not a string', () => {
    const userOptions = { dsn: 'test-dsn', release: 'user-release' };
    const env = { SENTRY_RELEASE: 123 };

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual(userOptions);
  });

  it('uses user options when SENTRY_RELEASE does not exist', () => {
    const userOptions = { dsn: 'test-dsn', release: 'user-release' };
    const env = { OTHER_VAR: 'some-value' };

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual(userOptions);
  });

  it('takes user options over env options', () => {
    const userOptions = { dsn: 'test-dsn', release: 'user-release' };
    const env = { SENTRY_RELEASE: 'env-release' };

    const result = getFinalOptions(userOptions, env);

    expect(result).toEqual(userOptions);
  });

  describe('CF_VERSION_METADATA', () => {
    it('uses CF_VERSION_METADATA.id as release when no other release is set', () => {
      const userOptions = { dsn: 'test-dsn' };
      const env = { CF_VERSION_METADATA: { id: 'version-123', tag: 'v1.0.0' } };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: 'version-123' });
    });

    it('prefers SENTRY_RELEASE over CF_VERSION_METADATA.id', () => {
      const userOptions = { dsn: 'test-dsn' };
      const env = {
        SENTRY_RELEASE: 'env-release',
        CF_VERSION_METADATA: { id: 'version-123' },
      };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: 'env-release' });
    });

    it('prefers user release over CF_VERSION_METADATA.id', () => {
      const userOptions = { dsn: 'test-dsn', release: 'user-release' };
      const env = { CF_VERSION_METADATA: { id: 'version-123' } };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: 'user-release' });
    });

    it('prefers user release over both SENTRY_RELEASE and CF_VERSION_METADATA.id', () => {
      const userOptions = { dsn: 'test-dsn', release: 'user-release' };
      const env = {
        SENTRY_RELEASE: 'env-release',
        CF_VERSION_METADATA: { id: 'version-123' },
      };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: 'user-release' });
    });

    it('ignores CF_VERSION_METADATA when it is not an object', () => {
      const userOptions = { dsn: 'test-dsn' };
      const env = { CF_VERSION_METADATA: 'not-an-object' };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: undefined });
    });

    it('ignores CF_VERSION_METADATA when id is not a string', () => {
      const userOptions = { dsn: 'test-dsn' };
      const env = { CF_VERSION_METADATA: { id: 123 } };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: undefined });
    });

    it('ignores CF_VERSION_METADATA when id is missing', () => {
      const userOptions = { dsn: 'test-dsn' };
      const env = { CF_VERSION_METADATA: { tag: 'v1.0.0' } };

      const result = getFinalOptions(userOptions, env);

      expect(result).toEqual({ dsn: 'test-dsn', release: undefined });
    });
  });
});
