import { describe, expect, it } from 'vitest';
import { defineCloudflareOptions } from '../src/defineCloudflareOptions';

describe('defineCloudflareOptions', () => {
  it('returns the callback unchanged', () => {
    const callback = (env: { SENTRY_DSN: string }) => ({ dsn: env.SENTRY_DSN });
    expect(defineCloudflareOptions(callback)).toBe(callback);
  });

  it('passes env through to the callback', () => {
    const callback = defineCloudflareOptions((env: { SENTRY_DSN: string }) => ({
      dsn: env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    }));

    expect(callback({ SENTRY_DSN: 'https://example' })).toEqual({
      dsn: 'https://example',
      tracesSampleRate: 1.0,
    });
  });

  it('normalizes a static options object into a callback', () => {
    const callback = defineCloudflareOptions({ tracesSampleRate: 0.5 });

    expect(typeof callback).toBe('function');
    expect(callback({} as never)).toEqual({ tracesSampleRate: 0.5 });
  });
});
