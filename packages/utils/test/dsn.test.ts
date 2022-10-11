import { dsnToString, makeDsn } from '../src/dsn';
import { SentryError } from '../src/error';

function testIf(condition: boolean): jest.It {
  return condition ? test : test.skip;
}

describe('Dsn', () => {
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
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('xyz');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('1234');
      expect(dsn.path).toBe('');
      expect(dsn.projectId).toBe('123');
    });

    test('applies partial components', () => {
      const dsn = makeDsn({
        host: 'sentry.io',
        projectId: '123',
        protocol: 'https',
        publicKey: 'abc',
      });
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('');
      expect(dsn.projectId).toBe('123');
    });

    testIf(__DEBUG_BUILD__)('throws for missing components', () => {
      expect(() =>
        makeDsn({
          host: '',
          projectId: '123',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toThrow(SentryError);
      expect(() =>
        makeDsn({
          host: 'sentry.io',
          projectId: '',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toThrow(SentryError);
      expect(() =>
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: '' as 'http', // Trick the type checker here
          publicKey: 'abc',
        }),
      ).toThrow(SentryError);
      expect(() =>
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: 'https',
          publicKey: '',
        }),
      ).toThrow(SentryError);
    });

    testIf(__DEBUG_BUILD__)('throws for invalid components', () => {
      expect(() =>
        makeDsn({
          host: 'sentry.io',
          projectId: '123',
          protocol: 'httpx' as 'http', // Trick the type checker here
          publicKey: 'abc',
        }),
      ).toThrow(SentryError);
      expect(() =>
        makeDsn({
          host: 'sentry.io',
          port: 'xxx',
          projectId: '123',
          protocol: 'https',
          publicKey: 'abc',
        }),
      ).toThrow(SentryError);
    });
  });

  describe('fromString', () => {
    test('parses a valid full Dsn', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('xyz');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('1234');
      expect(dsn.path).toBe('');
      expect(dsn.projectId).toBe('123');
    });

    test('parses a valid partial Dsn', () => {
      const dsn = makeDsn('https://abc@sentry.io/123/321');
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('123');
      expect(dsn.projectId).toBe('321');
    });

    test('parses a Dsn with empty password', () => {
      const dsn = makeDsn('https://abc:@sentry.io/123/321');
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('123');
      expect(dsn.projectId).toBe('321');
    });

    test('with a long path', () => {
      const dsn = makeDsn('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('sentry/custom/installation');
      expect(dsn.projectId).toBe('321');
    });

    test('with a query string', () => {
      const dsn = makeDsn('https://abc@sentry.io/321?sample.rate=0.1&other=value');
      expect(dsn.protocol).toBe('https');
      expect(dsn.publicKey).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('');
      expect(dsn.projectId).toBe('321');
    });

    testIf(__DEBUG_BUILD__)('throws when provided invalid Dsn', () => {
      expect(() => makeDsn('some@random.dsn')).toThrow(SentryError);
    });

    testIf(__DEBUG_BUILD__)('throws without mandatory fields', () => {
      expect(() => makeDsn('://abc@sentry.io/123')).toThrow(SentryError);
      expect(() => makeDsn('https://@sentry.io/123')).toThrow(SentryError);
      expect(() => makeDsn('https://abc@123')).toThrow(SentryError);
      expect(() => makeDsn('https://abc@sentry.io/')).toThrow(SentryError);
    });

    testIf(__DEBUG_BUILD__)('throws for invalid fields', () => {
      expect(() => makeDsn('httpx://abc@sentry.io/123')).toThrow(SentryError);
      expect(() => makeDsn('httpx://abc@sentry.io:xxx/123')).toThrow(SentryError);
      expect(() => makeDsn('http://abc@sentry.io/abc')).toThrow(SentryError);
    });
  });

  describe('toString', () => {
    test('excludes the password by default', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsnToString(dsn)).toBe('https://abc@sentry.io:1234/123');
    });

    test('optionally includes the password', () => {
      const dsn = makeDsn('https://abc:xyz@sentry.io:1234/123');
      expect(dsnToString(dsn, true)).toBe('https://abc:xyz@sentry.io:1234/123');
    });

    test('renders no password if missing', () => {
      const dsn = makeDsn('https://abc@sentry.io:1234/123');
      expect(dsnToString(dsn, true)).toBe('https://abc@sentry.io:1234/123');
    });

    test('renders no port if missing', () => {
      const dsn = makeDsn('https://abc@sentry.io/123');
      expect(dsnToString(dsn)).toBe('https://abc@sentry.io/123');
    });

    test('renders the full path correctly', () => {
      const dsn = makeDsn('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsnToString(dsn)).toBe('https://abc@sentry.io/sentry/custom/installation/321');
    });
  });
});
