import { describe, expect, it } from 'vitest';
import { isLocalhostRequest } from '../../../src/utils/localhost';

// These mirror the test cases of Relay's localhost inbound filter
// (relay-filter/src/localhost.rs), so that both stay in sync.
describe('isLocalhostRequest', () => {
  it('does not match without any request data', () => {
    expect(isLocalhostRequest(undefined)).toBe(false);
    expect(isLocalhostRequest({})).toBe(false);
    expect(isLocalhostRequest({ headers: {} })).toBe(false);
  });

  describe('ip address', () => {
    it.each(['127.0.0.1', '::1'])('matches %s', ip => {
      expect(isLocalhostRequest(undefined, ip)).toBe(true);
    });

    it.each(['133.12.12.1', '2001:db8:85a3:8d3:1319:8a2e:370:7348', '', '127.0.0.2'])('does not match %s', ip => {
      expect(isLocalhostRequest(undefined, ip)).toBe(false);
    });
  });

  describe('url', () => {
    it.each(['localhost', '127.0.0.1', 'foo.localhost', 'foo.bar.localhost'])('matches %s', host => {
      expect(isLocalhostRequest({ url: `http://${host}:8080/` })).toBe(true);
    });

    it.each(['localhost.com', 'foolocalhost', 'alocalhostgoesintoabar', 'sentry.io', 'notlocalhost.io', '127.0.0.2'])(
      'does not match %s',
      host => {
        expect(isLocalhostRequest({ url: `http://${host}:8080/` })).toBe(false);
      },
    );

    it('matches a file:// url', () => {
      expect(isLocalhostRequest({ url: 'file:///Users/someone/index.html' })).toBe(true);
    });

    it('does not match a relative url', () => {
      expect(isLocalhostRequest({ url: '/api/users' })).toBe(false);
    });

    it('does not match an unparseable url', () => {
      expect(isLocalhostRequest({ url: 'not a url' })).toBe(false);
    });
  });

  describe('host headers', () => {
    it.each(['host', 'x-forwarded-host'])('matches localhost in the %s header', header => {
      expect(isLocalhostRequest({ headers: { [header]: 'localhost' } })).toBe(true);
      expect(isLocalhostRequest({ headers: { [header]: 'localhost:3000' } })).toBe(true);
      expect(isLocalhostRequest({ headers: { [header]: '127.0.0.1' } })).toBe(true);
      expect(isLocalhostRequest({ headers: { [header]: '127.0.0.1:8080' } })).toBe(true);
    });

    // Relay compares host headers exactly, without the subdomain check it applies to URLs.
    it.each(['host', 'x-forwarded-host'])('does not match a subdomain in the %s header', header => {
      expect(isLocalhostRequest({ headers: { [header]: 'foo.localhost:3000' } })).toBe(false);
    });

    it.each(['host', 'x-forwarded-host'])('does not match a remote host in the %s header', header => {
      expect(isLocalhostRequest({ headers: { [header]: 'sentry.io' } })).toBe(false);
      expect(isLocalhostRequest({ headers: { [header]: 'localhost.com:3000' } })).toBe(false);
      expect(isLocalhostRequest({ headers: { [header]: '' } })).toBe(false);
    });

    it('matches if either host header is local', () => {
      expect(isLocalhostRequest({ headers: { host: 'localhost:3000', 'x-forwarded-host': 'example.com' } })).toBe(true);
      expect(isLocalhostRequest({ headers: { host: 'example.com', 'x-forwarded-host': 'localhost:3000' } })).toBe(true);
    });

    it('falls back to the headers when the url is remote', () => {
      expect(isLocalhostRequest({ url: 'https://example.com/api', headers: { host: 'localhost:3000' } })).toBe(true);
    });
  });
});

// Header names are matched case-insensitively, which Relay gets for free from its header map.
describe('isLocalhostRequest host header casing', () => {
  it.each(['host', 'Host', 'HOST', 'hOsT'])('matches the %s header', header => {
    expect(isLocalhostRequest({ headers: { [header]: 'localhost:3000' } })).toBe(true);
  });

  it.each(['x-forwarded-host', 'X-Forwarded-Host', 'X-FORWARDED-HOST', 'x-Forwarded-host'])(
    'matches the %s header',
    header => {
      expect(isLocalhostRequest({ headers: { [header]: 'localhost:3000' } })).toBe(true);
    },
  );

  it('still does not match unrelated headers whose name lower-cases differently', () => {
    expect(isLocalhostRequest({ headers: { 'X-Original-Host': 'localhost:3000' } })).toBe(false);
    expect(isLocalhostRequest({ headers: { Origin: 'localhost' } })).toBe(false);
  });
});
