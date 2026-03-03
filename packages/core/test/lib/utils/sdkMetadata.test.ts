import { describe, expect, it } from 'vitest';
import { applySdkMetadata } from '../../../src';

describe('applySdkMetadata', () => {
  it('applies a custom SDK name', () => {
    const options = {
      dsn: '123',
    };

    applySdkMetadata(options, 'angular');

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.angular',
          packages: [
            {
              name: 'npm:@sentry/angular',
              version: expect.any(String),
            },
          ],
          version: expect.any(String),
        },
      },
      dsn: '123',
    });
  });

  it('attaches multiple packages if names is passed in', () => {
    const options = {
      dsn: '123',
    };

    applySdkMetadata(options, 'angular', ['angular', 'browser']);

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.angular',
          packages: [
            { name: 'npm:@sentry/angular', version: expect.any(String) },
            { name: 'npm:@sentry/browser', version: expect.any(String) },
          ],
          version: expect.any(String),
        },
      },
      dsn: '123',
    });
  });

  it('sets the source if source is passed in', () => {
    const options = {
      dsn: '123',
    };

    applySdkMetadata(options, 'angular', ['angular', 'browser'], 'cdn');

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.angular',
          packages: [
            { name: 'cdn:@sentry/angular', version: expect.any(String) },
            { name: 'cdn:@sentry/browser', version: expect.any(String) },
          ],
          version: expect.any(String),
        },
      },
      dsn: '123',
    });
  });

  it('preserves existing SDK metadata if already set', () => {
    const options = {
      dsn: '123',
      _metadata: {
        sdk: {
          name: 'sentry.javascript.react',
        },
      },
    };

    applySdkMetadata(options, 'angular', ['angular', 'browser'], 'cdn');

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.react',
        },
      },
      dsn: '123',
    });
  });

  it('merges existing SDK metadata with default values', () => {
    const options = {
      dsn: '123',
      _metadata: {
        sdk: {
          settings: {
            infer_ip: 'auto' as const,
          },
        },
      },
    };

    applySdkMetadata(options, 'angular');

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.angular',
          packages: [{ name: 'npm:@sentry/angular', version: expect.any(String) }],
          version: expect.any(String),
          settings: {
            infer_ip: 'auto' as const,
          },
        },
      },
      dsn: '123',
    });
  });

  it('handles empty metadata object', () => {
    const options = {
      dsn: '123',
      _metadata: {},
    };

    applySdkMetadata(options, 'angular');

    expect(options).toEqual({
      _metadata: {
        sdk: {
          name: 'sentry.javascript.angular',
          packages: [{ name: 'npm:@sentry/angular', version: expect.any(String) }],
          version: expect.any(String),
        },
      },
      dsn: '123',
    });
  });
});
