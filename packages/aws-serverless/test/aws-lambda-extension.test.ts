import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSentryDSNFromEnv } from '../src/lambda-extension/aws-lambda-extension';

describe('getSentryDSNFromEnv', () => {
  afterEach(() => {
    delete process.env.SENTRY_DSN;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('returns undefined when SENTRY_DSN is unset', () => {
    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });

  test('returns canonical dsn string when SENTRY_DSN is valid', () => {
    process.env.SENTRY_DSN = 'https://public@o1.ingest.sentry.io/1';

    expect(getSentryDSNFromEnv()).toEqual({
      protocol: 'https',
      publicKey: 'public',
      host: 'o1.ingest.sentry.io',
      projectId: '1',
    });
  });

  test('returns undefined when SENTRY_DSN is invalid', () => {
    process.env.SENTRY_DSN = 'not-a-dsn';

    expect(getSentryDSNFromEnv()).toEqual(undefined);
  });
});
