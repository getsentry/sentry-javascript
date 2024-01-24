/* eslint-disable deprecation/deprecation */
import * as utils from '@sentry/utils';

import { extractNetworkProtocol, instrumentOutgoingRequests, shouldAttachHeaders } from '../../src/browser/request';

beforeAll(() => {
  // @ts-expect-error need to override global Request because it's not in the jest environment (even with an
  // `@jest-environment jsdom` directive, for some reason)
  global.Request = {};
});

describe('instrumentOutgoingRequests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instruments fetch and xhr requests', () => {
    const addFetchSpy = jest.spyOn(utils, 'addFetchInstrumentationHandler');
    const addXhrSpy = jest.spyOn(utils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests();

    expect(addFetchSpy).toHaveBeenCalledWith(expect.any(Function));
    expect(addXhrSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not instrument fetch requests if traceFetch is false', () => {
    const addFetchSpy = jest.spyOn(utils, 'addFetchInstrumentationHandler');

    instrumentOutgoingRequests({ traceFetch: false });

    expect(addFetchSpy).not.toHaveBeenCalled();
  });

  it('does not instrument xhr requests if traceXHR is false', () => {
    const addXhrSpy = jest.spyOn(utils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests({ traceXHR: false });

    expect(addXhrSpy).not.toHaveBeenCalled();
  });
});

interface ProtocolInfo {
  name: string;
  version: string;
}

describe('HTTPTimings', () => {
  describe('Extracting version from ALPN protocol', () => {
    const nextHopToNetworkVersion: Record<string, ProtocolInfo> = {
      'http/0.9': { name: 'http', version: '0.9' },
      'http/1.0': { name: 'http', version: '1.0' },
      'http/1.1': { name: 'http', version: '1.1' },
      'spdy/1': { name: 'spdy', version: '1' },
      'spdy/2': { name: 'spdy', version: '2' },
      'spdy/3': { name: 'spdy', version: '3' },
      'stun.turn': { name: 'stun.turn', version: 'unknown' },
      'stun.nat-discovery': { name: 'stun.nat-discovery', version: 'unknown' },
      h2: { name: 'http', version: '2' },
      h2c: { name: 'http', version: '2c' },
      webrtc: { name: 'webrtc', version: 'unknown' },
      'c-webrtc': { name: 'c-webrtc', version: 'unknown' },
      ftp: { name: 'ftp', version: 'unknown' },
      imap: { name: 'imap', version: 'unknown' },
      pop3: { name: 'pop', version: '3' },
      managesieve: { name: 'managesieve', version: 'unknown' },
      coap: { name: 'coap', version: 'unknown' },
      'xmpp-client': { name: 'xmpp-client', version: 'unknown' },
      'xmpp-server': { name: 'xmpp-server', version: 'unknown' },
      'acme-tls/1': { name: 'acme-tls', version: '1' },
      mqtt: { name: 'mqtt', version: 'unknown' },
      dot: { name: 'dot', version: 'unknown' },
      'ntske/1': { name: 'ntske', version: '1' },
      sunrpc: { name: 'sunrpc', version: 'unknown' },
      h3: { name: 'http', version: '3' },
      smb: { name: 'smb', version: 'unknown' },
      irc: { name: 'irc', version: 'unknown' },
      nntp: { name: 'nntp', version: 'unknown' },
      nnsp: { name: 'nnsp', version: 'unknown' },
      doq: { name: 'doq', version: 'unknown' },
      'sip/2': { name: 'sip', version: '2' },
      'tds/8.0': { name: 'tds', version: '8.0' },
      dicom: { name: 'dicom', version: 'unknown' },
    };

    const protocols = Object.keys(nextHopToNetworkVersion);
    for (const protocol of protocols) {
      const expected: ProtocolInfo = nextHopToNetworkVersion[protocol];
      expect(extractNetworkProtocol(protocol)).toMatchObject(expected);
    }
  });
});

describe('shouldAttachHeaders', () => {
  describe('should prefer `tracePropagationTargets` over defaults', () => {
    it('should return `true` if the url matches the new tracePropagationTargets', () => {
      expect(shouldAttachHeaders('http://example.com', ['example.com'])).toBe(true);
    });

    it('should return `false` if tracePropagationTargets array is empty', () => {
      expect(shouldAttachHeaders('http://localhost:3000/test', [])).toBe(false);
    });

    it("should return `false` if tracePropagationTargets array doesn't match", () => {
      expect(shouldAttachHeaders('http://localhost:3000/test', ['example.com'])).toBe(false);
    });
  });

  describe('should fall back to defaults if no options are specified', () => {
    it.each([
      '/api/test',
      'http://localhost:3000/test',
      'http://somewhere.com/test/localhost/123',
      'http://somewhere.com/test?url=localhost:3000&test=123',
      '//localhost:3000/test',
      '/',
    ])('return `true` for urls matching defaults (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(true);
    });

    it.each(['notmydoman/api/test', 'example.com', '//example.com'])(
      'return `false` for urls not matching defaults (%s)',
      url => {
        expect(shouldAttachHeaders(url, undefined)).toBe(false);
      },
    );
  });
});
