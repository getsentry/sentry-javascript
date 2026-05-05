import { describe, expect, it } from 'vitest';
import { isSentryRequestUrl } from '../../../src';
import type { Client } from '../../../src/client';

describe('isSentryRequestUrl', () => {
  it.each([
    ['http://sentry-dsn.com/my-url?sentry_key=123', 'sentry-dsn.com', ''],

    ['http://tunnel:4200', 'sentry-dsn.com', 'http://tunnel:4200'],
    ['http://tunnel:4200', 'sentry-dsn.com', 'http://tunnel:4200/'],
    ['http://tunnel:4200/', 'sentry-dsn.com', 'http://tunnel:4200'],
    ['http://tunnel:4200/', 'another-dsn.com', 'http://tunnel:4200'],
  ])('returns `true` for url=%s, dsn=%s, tunnel=%s', (url: string, dsn: string, tunnel: string) => {
    const client = {
      getOptions: () => ({ tunnel }),
      getDsn: () => ({ host: dsn }),
    } as unknown as Client;

    expect(isSentryRequestUrl(url, client)).toBe(true);
  });

  it.each([
    ['http://tunnel:4200/?sentry_key=123', 'another-dsn.com', ''],
    ['http://sentry-dsn.com/my-url', 'sentry-dsn.com', ''],
    ['http://sentry-dsn.com', 'sentry-dsn.com', ''],
    ['http://sAntry-dsn.com/?sentry_key=123', 'sentry-dsn.com', ''],
    ['http://sAntry-dsn.com/?sAntry_key=123', 'sAntry-dsn.com', ''],
    ['/ingest', 'sentry-dsn.com', ''],
    ['/ingest?sentry_key=123', 'sentry-dsn.com', ''],
    ['/ingest', '', ''],
    ['', '', ''],
    ['', 'sentry-dsn.com', ''],

    ['http://tunnel:4200/', 'another-dsn.com', 'http://tunnel:4200/sentry-tunnel'],
    ['http://tunnel:4200/a', 'sentry-dsn.com', 'http://tunnel:4200'],
    ['http://tunnel:4200/a', '', 'http://tunnel:4200/'],
  ])('returns `false` for url=%s, dsn=%s, tunnel=%s', (url: string, dsn: string, tunnel: string) => {
    const client = {
      getOptions: () => ({ tunnel }),
      getDsn: () => ({ host: dsn }),
    } as unknown as Client;

    expect(isSentryRequestUrl(url, client)).toBe(false);
  });

  it('handles undefined client', () => {
    expect(isSentryRequestUrl('http://sentry-dsn.com/my-url?sentry_key=123', undefined)).toBe(false);
  });

  it('does not treat attacker-controlled hostnames that merely contain the DSN host as Sentry URLs', () => {
    const dsnHost = 'o123456.ingest.sentry.io';
    const client = {
      getOptions: () => ({ tunnel: '' }),
      getDsn: () => ({ host: dsnHost }),
    } as unknown as Client;

    expect(isSentryRequestUrl(`https://${dsnHost}.attacker.com/exfil?sentry_key=fake&data=stolen`, client)).toBe(false);
  });

  it('still matches legitimate subdomains of the DSN host', () => {
    const dsnHost = 'ingest.sentry.io';
    const client = {
      getOptions: () => ({ tunnel: '' }),
      getDsn: () => ({ host: dsnHost }),
    } as unknown as Client;

    expect(isSentryRequestUrl('https://o123456.ingest.sentry.io/api/1/store/?sentry_key=abc', client)).toBe(true);
  });
});
