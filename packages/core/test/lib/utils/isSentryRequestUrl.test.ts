import { describe, expect, it } from 'vitest';
import { isSentryRequestUrl } from '../../../src';
import type { Client } from '../../../src/client';

describe('isSentryRequestUrl', () => {
  it.each([
    ['http://sentry-dsn.com/my-url?sentry_key=123', 'sentry-dsn.com', '', true],
    ['http://tunnel:4200', 'sentry-dsn.com', 'http://tunnel:4200', true],
    ['http://tunnel:4200', 'sentry-dsn.com', 'http://tunnel:4200/', true],
    ['http://tunnel:4200/', 'sentry-dsn.com', 'http://tunnel:4200', true],
    ['http://tunnel:4200/', 'another-dsn.com', 'http://tunnel:4200', true],

    ['http://tunnel:4200/?sentry_key=123', 'another-dsn.com', '', false],
    ['http://sentry-dsn.com/my-url', 'sentry-dsn.com', '', false],
    ['http://sentry-dsn.com', 'sentry-dsn.com', '', false],
    ['http://tunnel:4200/', 'another-dsn.com', 'http://tunnel:4200/sentry-tunnel', false],
    ['', 'sentry-dsn.com', '', false],
    ['http://tunnel:4200/a', 'sentry-dsn.com', 'http://tunnel:4200', false],
  ])('works with url=%s, dsn=%s, tunnel=%s', (url: string, dsn: string, tunnel: string, expected: boolean) => {
    const client = {
      getOptions: () => ({ tunnel }),
      getDsn: () => ({ host: dsn }),
    } as unknown as Client;

    // Works with client passed
    expect(isSentryRequestUrl(url, client)).toBe(expected);
  });
});
