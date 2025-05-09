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
});
