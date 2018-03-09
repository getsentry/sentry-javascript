import { expect } from 'chai';
import { DSN } from '../../src/lib/dsn';
import { SentryError } from '../../src/lib/error';

describe('DSN', () => {
  describe('fromComponents', () => {
    it('applies all components', () => {
      const dsn = new DSN({
        host: 'sentry.io',
        pass: 'xyz',
        path: '123',
        port: '1234',
        protocol: 'https',
        user: 'abc',
      });
      expect(dsn.protocol).to.equal('https');
      expect(dsn.user).to.equal('abc');
      expect(dsn.pass).to.equal('xyz');
      expect(dsn.host).to.equal('sentry.io');
      expect(dsn.port).to.equal('1234');
      expect(dsn.path).to.equal('123');
    });

    it('applies partial components', () => {
      const dsn = new DSN({
        host: 'sentry.io',
        path: '123',
        protocol: 'https',
        user: 'abc',
      });
      expect(dsn.protocol).to.equal('https');
      expect(dsn.user).to.equal('abc');
      expect(dsn.pass).to.equal('');
      expect(dsn.host).to.equal('sentry.io');
      expect(dsn.port).to.equal('');
      expect(dsn.path).to.equal('123');
    });

    it('throws for missing components', () => {
      expect(
        () =>
          new DSN({
            host: '',
            path: '123',
            protocol: 'https',
            user: 'abc',
          }),
      ).to.throw(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            path: '',
            protocol: 'https',
            user: 'abc',
          }),
      ).to.throw(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            path: '123',
            protocol: '' as 'http', // Trick the type checker here
            user: 'abc',
          }),
      ).to.throw(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            path: '123',
            protocol: 'https',
            user: '',
          }),
      ).to.throw(SentryError);
    });

    it('throws for invalid components', () => {
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            path: '123',
            protocol: 'httpx' as 'http', // Trick the type checker here
            user: 'abc',
          }),
      ).to.throw(SentryError);
      expect(
        () =>
          new DSN({
            host: 'sentry.io',
            path: '123',
            port: 'xxx',
            protocol: 'https',
            user: 'abc',
          }),
      ).to.throw(SentryError);
    });
  });

  describe('fromString', () => {
    it('parses a valid full DSN', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.protocol).to.equal('https');
      expect(dsn.user).to.equal('abc');
      expect(dsn.pass).to.equal('xyz');
      expect(dsn.host).to.equal('sentry.io');
      expect(dsn.port).to.equal('1234');
      expect(dsn.path).to.equal('123');
    });

    it('parses a valid partial DSN', () => {
      const dsn = new DSN('https://abc@sentry.io/123');
      expect(dsn.protocol).to.equal('https');
      expect(dsn.user).to.equal('abc');
      expect(dsn.pass).to.equal('');
      expect(dsn.host).to.equal('sentry.io');
      expect(dsn.port).to.equal('');
      expect(dsn.path).to.equal('123');
    });

    it('throws when provided invalid DSN', () => {
      expect(() => new DSN('some@random.dsn')).to.throw(SentryError);
    });

    it('throws without mandatory fields', () => {
      expect(() => new DSN('://abc@sentry.io/123')).to.throw(SentryError);
      expect(() => new DSN('https://@sentry.io/123')).to.throw(SentryError);
      expect(() => new DSN('https://abc@123')).to.throw(SentryError);
      expect(() => new DSN('https://abc@sentry.io/')).to.throw(SentryError);
    });

    it('throws for invalid fields', () => {
      expect(() => new DSN('httpx://abc@sentry.io/123')).to.throw(SentryError);
      expect(() => new DSN('httpx://abc@sentry.io:xxx/123')).to.throw(
        SentryError,
      );
    });
  });

  describe('toString', () => {
    it('excludes the password by default', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.toString()).to.equal('https://abc@sentry.io:1234/123');
    });

    it('optionally includes the password', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.toString(true)).to.equal('https://abc:xyz@sentry.io:1234/123');
    });

    it('renders no password if missing', () => {
      const dsn = new DSN('https://abc@sentry.io:1234/123');
      expect(dsn.toString(true)).to.equal('https://abc@sentry.io:1234/123');
    });

    it('renders no port if missing', () => {
      const dsn = new DSN('https://abc@sentry.io/123');
      expect(dsn.toString()).to.equal('https://abc@sentry.io/123');
    });
  });
});
