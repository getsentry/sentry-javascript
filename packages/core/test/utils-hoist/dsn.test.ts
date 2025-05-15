import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { DEBUG_BUILD } from '../../src/debug-build';
import { dsnToString, extractOrgIdFromDsnHost, makeDsn } from '../../src/utils-hoist/dsn';
import { logger } from '../../src/utils-hoist/logger';

function testIf(condition: boolean) {
  return condition ? test : test.skip;
}

const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Dsn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fromComponents', () => {
    test('applies all components', () => {
      const dsn = makeDsn({
        host: 'sentry.io',
        pass: 'xyz',
        port: '1234',
        projectId: '123',
        protocol: 'https',
        publicKey: 'abc',
      });
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('xyz');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('1234');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('123');
    });

    test('applies partial components', () => {
      const dsn = makeDsn({
        host: 'sentry.io',
        projectId: '123',
        protocol: 'https',
        publicKey: 'abc',
      });
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('123');
    });

    testIf(DEBUG_BUILD)('returns `undefined` for missing components', () => {
      expect(
        makeDsn({
          host: '',
          projectId: '123',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toBeUndefined();
      expect(
        makeDsn({
          host: 'sentry.io',
          projectId: '',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toBeUndefined();
      expect(
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: '' as 'http', // Trick the type checker here
          publicKey: 'abc',
        }),
      ).toBeUndefined();
      expect(
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: 'https',
          publicKey: '',
        }),
      ).toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalledTimes(4);
    });

    testIf(DEBUG_BUILD)('returns `undefined` if components are invalid', () => {
      expect(
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: 'httpx' as 'http', // Trick the type checker here
          publicKey: 'abc',
        }),
      ).toBeUndefined();
      expect(
        makeDsn({
          host: 'sentry.io',
          port: 'xxx',
          projectId: '123',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toBeUndefined();

      expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('fromString', () => {
    test('parses a valid full Dsn', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('xyz');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('1234');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('123');
    });

    test('parses a valid partial Dsn', () => {
      const dsn = makeDsn('https://abc@sentry.io/123/321');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('123');
      expect(dsn?.projectId).toBe('321');
    });

    test('parses a Dsn with empty password', () => {
      const dsn = makeDsn('https://abc:@sentry.io/123/321');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('123');
      expect(dsn?.projectId).toBe('321');
    });

    test('with a long path', () => {
      const dsn = makeDsn('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('sentry/custom/installation');
      expect(dsn?.projectId).toBe('321');
    });

    test('with a query string', () => {
      const dsn = makeDsn('https://abc@sentry.io/321?sample.rate=0.1&other=value');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('sentry.io');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('321');
    });

    testIf(DEBUG_BUILD)('returns undefined when provided invalid Dsn', () => {
      expect(makeDsn('some@random.dsn')).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    testIf(DEBUG_BUILD)('returns undefined if mandatory fields are missing', () => {
      expect(makeDsn('://abc@sentry.io/123')).toBeUndefined();
      expect(makeDsn('https://@sentry.io/123')).toBeUndefined();
      expect(makeDsn('https://abc@123')).toBeUndefined();
      expect(makeDsn('https://abc@sentry.io/')).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    });

    testIf(DEBUG_BUILD)('returns undefined if fields are invalid', () => {
      expect(makeDsn('httpx://abc@sentry.io/123')).toBeUndefined();
      expect(makeDsn('httpx://abc@sentry.io:xxx/123')).toBeUndefined();
      expect(makeDsn('http://abc@sentry.io/abc')).toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('toString', () => {
    test('excludes the password by default', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsnToString(dsn!)).toBe('https://abc@sentry.io:1234/123');
    });

    test('optionally includes the password', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsnToString(dsn!, true)).toBe('https://abc:xyz@sentry.io:1234/123');
    });

    test('renders no password if missing', () => {
      const dsn = makeDsn('https://abc@sentry.io:1234/123');
      expect(dsnToString(dsn!, true)).toBe('https://abc@sentry.io:1234/123');
    });

    test('renders no port if missing', () => {
      const dsn = makeDsn('https://abc@sentry.io/123');
      expect(dsnToString(dsn!)).toBe('https://abc@sentry.io/123');
    });

    test('renders the full path correctly', () => {
      const dsn = makeDsn('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsnToString(dsn!)).toBe('https://abc@sentry.io/sentry/custom/installation/321');
    });
  });
});

describe('extractOrgIdFromDsnHost', () => {
  it('extracts the org ID from a DSN host with standard format', () => {
    expect(extractOrgIdFromDsnHost('o123456.sentry.io')).toBe('123456');
  });

  it('extracts numeric org IDs of different lengths', () => {
    expect(extractOrgIdFromDsnHost('o1.ingest.sentry.io')).toBe('1');
    expect(extractOrgIdFromDsnHost('o42.sentry.io')).toBe('42');
    expect(extractOrgIdFromDsnHost('o9999999.sentry.io')).toBe('9999999');
  });

  it('returns undefined for hosts without an org ID prefix', () => {
    expect(extractOrgIdFromDsnHost('sentry.io')).toBeUndefined();
    expect(extractOrgIdFromDsnHost('example.com')).toBeUndefined();
  });

  it('returns undefined for hosts with invalid org ID format', () => {
    expect(extractOrgIdFromDsnHost('oabc.sentry.io')).toBeUndefined();
    expect(extractOrgIdFromDsnHost('o.sentry.io')).toBeUndefined();
    expect(extractOrgIdFromDsnHost('oX123.sentry.io')).toBeUndefined();
  });

  it('handles different domain variations', () => {
    expect(extractOrgIdFromDsnHost('o123456.ingest.sentry.io')).toBe('123456');
    expect(extractOrgIdFromDsnHost('o123456.custom-domain.com')).toBe('123456');
  });

  it('handles empty string input', () => {
    expect(extractOrgIdFromDsnHost('')).toBeUndefined();
  });
});
