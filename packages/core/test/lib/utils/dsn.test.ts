import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { debug } from '../../../src/utils/debug-logger';
import { dsnToString, extractOrgIdFromClient, extractOrgIdFromDsnHost, makeDsn } from '../../../src/utils/dsn';
import { getDefaultTestClientOptions, TestClient } from '../../mocks/client';

let mockDebugBuild = true;

vi.mock('../../../src/debug-build', () => ({
  get DEBUG_BUILD() {
    return mockDebugBuild;
  },
}));

const loggerErrorSpy = vi.spyOn(debug, 'error').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Dsn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDebugBuild = true;
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

    it('returns `undefined` for missing components', () => {
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

    it('returns `undefined` if components are invalid', () => {
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

    test('with IPv4 hostname', () => {
      const dsn = makeDsn('https://abc@192.168.1.1/123');
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe('192.168.1.1');
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('123');
    });

    test.each([
      '[2001:db8::1]',
      '[::1]', // loopback
      '[::ffff:192.0.2.1]', // IPv4-mapped IPv6 (contains dots)
      '[fe80::1]', // link-local
      '[2001:db8:85a3::8a2e:370:7334]', // compressed in middle
      '[2001:db8::]', // trailing zeros compressed
      '[2001:0db8:0000:0000:0000:0000:0000:0001]', // full form with leading zeros
      '[fe80::1%eth0]', // zone identifier with interface name (contains percent sign)
      '[fe80::1%25eth0]', // zone identifier URL-encoded (percent as %25)
      '[fe80::a:b:c:d%en0]', // zone identifier with different interface
    ])('with IPv6 hostname %s', hostname => {
      const dsn = makeDsn(`https://abc@${hostname}/123`);
      expect(dsn?.protocol).toBe('https');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
      expect(dsn?.host).toBe(hostname);
      expect(dsn?.port).toBe('');
      expect(dsn?.path).toBe('');
      expect(dsn?.projectId).toBe('123');
    });

    test('skips validation for non-debug builds', () => {
      mockDebugBuild = false;
      const dsn = makeDsn('httx://abc@192.168.1.1/123');
      expect(dsn?.protocol).toBe('httx');
      expect(dsn?.publicKey).toBe('abc');
      expect(dsn?.pass).toBe('');
    });

    it('returns undefined when provided invalid Dsn', () => {
      expect(makeDsn('some@random.dsn')).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('returns undefined if mandatory fields are missing', () => {
      expect(makeDsn('://abc@sentry.io/123')).toBeUndefined();
      expect(makeDsn('https://@sentry.io/123')).toBeUndefined();
      expect(makeDsn('https://abc@123')).toBeUndefined();
      expect(makeDsn('https://abc@sentry.io/')).toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    });

    it('returns undefined if fields are invalid', () => {
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

describe('extractOrgIdFromClient', () => {
  let client: TestClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns orgId from client options when available', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: '00222111',
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const result = extractOrgIdFromClient(client);
    expect(result).toBe('00222111');
  });

  test('converts non-string orgId to string', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        orgId: 12345,
        dsn: 'https://public@sentry.example.com/1',
      }),
    );

    const result = extractOrgIdFromClient(client);
    expect(result).toBe('12345');
  });

  test('extracts orgId from DSN host when options.orgId is not available', () => {
    client = new TestClient(
      getDefaultTestClientOptions({
        dsn: 'https://public@o012300.example.com/1',
      }),
    );

    const result = extractOrgIdFromClient(client);
    expect(result).toBe('012300');
  });

  test('returns undefined when neither options.orgId nor DSN host are available', () => {
    client = new TestClient(getDefaultTestClientOptions({}));

    const result = extractOrgIdFromClient(client);
    expect(result).toBeUndefined();
  });
});
