import { DEBUG_BUILD } from '../src/debug-build';
import { dsnToString, makeDsn } from '../src/dsn';
import { logger } from '../src/logger';

function testIf(condition: boolean): jest.It {
  return condition ? test : test.skip;
}

const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Dsn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
