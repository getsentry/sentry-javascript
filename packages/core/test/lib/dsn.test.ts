import { expect } from 'chai';
import { SentryError } from '../../src/lib/sentry';
import { DSN } from '../../src/lib/dsn';

describe('DSN', () => {
  it('should throw SentryError when provided invalid DSN', () => {
    expect(() => {
      new DSN('some@random.dsn');
    }).to.throw(SentryError);
  });

  it('should not throw SentryError when provided correct DSN', () => {
    expect(() => new DSN('https://abc:xyz@sentry.io:1234/123')).to.not.throw(
      SentryError,
    );
  });

  it('password and port should be optional', () => {
    expect(() => new DSN('https://abc@sentry.io/123')).to.not.throw(
      SentryError,
    );
  });

  it('protocol, user, host and path should be mandatory', () => {
    expect(() => new DSN('://abc@sentry.io/123')).to.throw(SentryError);
    expect(() => new DSN('https://@sentry.io/123')).to.throw(SentryError);
    expect(() => new DSN('https://abc@123')).to.throw(SentryError);
    expect(() => new DSN('https://abc@sentry.io/')).to.throw(SentryError);
  });

  describe('parse DSN', () => {
    it('should exclude password by default', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.getDSN()).to.equal('https://abc@sentry.io:1234/123');
    });

    it('should allow to retrieve DSN including password', () => {
      const dsn = new DSN('https://abc:xyz@sentry.io:1234/123');
      expect(dsn.getDSN(true)).to.equal('https://abc:xyz@sentry.io:1234/123');
    });

    it('should default to empty string if password is not provided', () => {
      const dsn = new DSN('https://abc@sentry.io:1234/123');
      expect(dsn.getDSN()).to.equal('https://abc@sentry.io:1234/123');
      expect(dsn.getDSN(true)).to.equal('https://abc@sentry.io:1234/123');
    });

    it('should default to empty string if port is not provided', () => {
      const dsn = new DSN('https://abc@sentry.io/123');
      expect(dsn.getDSN()).to.equal('https://abc@sentry.io/123');
    });
  });
});
