import { DSN } from '../../src/dsn';
import { SentryError } from '../../src/error';

describe('DSN', () => {
  describe('fromComponents', () => {
    test('applies all components', () => {
      const dsn = new DSN({
        host: 'sentry.io',
        pass: 'xyz',
        port: '1234',
        projectId: '123',
        protocol: 'https',
        user: 'abc',
      });
      expect(dsn.protocol).toBe('https');
      expect(dsn.user).toBe('abc');
      expect(dsn.pass).toBe('xyz');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('1234');
      expect(dsn.projectId).toBe('123');
      expect(dsn.path).toBe('');
    });

    test('applies partial components', () => {
      const dsn = new DSN({
        host: 'sentry.io',
        projectId: '123',
        protocol: 'https',
        user: 'abc',
      });
      expect(dsn.protocol).toBe('https');
      expect(dsn.user).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.projectId).toBe('123');
      expect(dsn.path).toBe('');
    });

    test('throws for missing components', () => {
      expect(
        () =>
          new DSN({
            host: '',
            projectId: '123',
            protocol: 'https',
            user: 'abc',
          }),
      ).toThrow(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            projectId: '',
            protocol: 'https',
            user: 'abc',
          }),
      ).toThrow(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            projectId: '123',
            protocol: '' as 'http', // Trick the type checker here
            user: 'abc',
          }),
      ).toThrow(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            projectId: '123',
            protocol: 'https',
            user: '',
          }),
      ).toThrow(SentryError);
    });

    test('throws for invalid components', () => {
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            projectId: '123',
            protocol: 'httpx' as 'http', // Trick the type checker here
            user: 'abc',
          }),
      ).toThrow(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            port: 'xxx',
            projectId: '123',
            protocol: 'https',
            user: 'abc',
          }),
      ).toThrow(SentryError);
    });
  });

  describe('fromString', () => {
    test('parses a valid full DSN', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.protocol).toBe('https');
      expect(dsn.user).toBe('abc');
      expect(dsn.pass).toBe('xyz');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('1234');
      expect(dsn.projectId).toBe('123');
      expect(dsn.path).toBe('');
    });

    test('parses a valid partial DSN', () => {
      const dsn = new DSN('https://abc@sentry.io/123/321');
      expect(dsn.protocol).toBe('https');
      expect(dsn.user).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('123');
      expect(dsn.projectId).toBe('321');
    });

    test('with a long path', () => {
      const dsn = new DSN('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsn.protocol).toBe('https');
      expect(dsn.user).toBe('abc');
      expect(dsn.pass).toBe('');
      expect(dsn.host).toBe('sentry.io');
      expect(dsn.port).toBe('');
      expect(dsn.path).toBe('sentry/custom/installation');
      expect(dsn.projectId).toBe('321');
    });

    test('throws when provided invalid DSN', () => {
      expect(() => new DSN('some@random.dsn')).toThrow(SentryError);
    });

    test('throws without mandatory fields', () => {
      expect(() => new DSN('://abc@sentry.io/123')).toThrow(SentryError);
      expect(() => new DSN('https://@sentry.io/123')).toThrow(SentryError);
      expect(() => new DSN('https://abc@123')).toThrow(SentryError);
      expect(() => new DSN('https://abc@sentry.io/')).toThrow(SentryError);
    });

    test('throws for invalid fields', () => {
      expect(() => new DSN('httpx://abc@sentry.io/123')).toThrow(SentryError);
      expect(() => new DSN('httpx://abc@sentry.io:xxx/123')).toThrow(SentryError);
    });
  });

  describe('toString', () => {
    test('excludes the password by default', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.toString()).toBe('https://abc@sentry.io:1234/123');
    });

    test('optionally includes the password', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.toString(true)).toBe('https://abc:xyz@sentry.io:1234/123');
    });

    test('renders no password if missing', () => {
      const dsn = new DSN('https://abc@sentry.io:1234/123');
      expect(dsn.toString(true)).toBe('https://abc@sentry.io:1234/123');
    });

    test('renders no port if missing', () => {
      const dsn = new DSN('https://abc@sentry.io/123');
      expect(dsn.toString()).toBe('https://abc@sentry.io/123');
    });

    test('renders the full path correctly', () => {
      const dsn = new DSN('https://abc@sentry.io/sentry/custom/installation/321');
      expect(dsn.toString()).toBe('https://abc@sentry.io/sentry/custom/installation/321');
    });
  });
});
