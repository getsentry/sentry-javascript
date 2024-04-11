import * as browserUtils from '@sentry-internal/browser-utils';
import * as utils from '@sentry/utils';
import { WINDOW } from '../../../src/helpers';

import { extractNetworkProtocol, instrumentOutgoingRequests, shouldAttachHeaders } from '../../../src/tracing/request';

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
    const addXhrSpy = jest.spyOn(browserUtils, 'addXhrInstrumentationHandler');

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
    const addXhrSpy = jest.spyOn(browserUtils, 'addXhrInstrumentationHandler');

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

  describe('with no defined `tracePropagationTargets`', () => {
    let originalWindowLocation: Location;

    beforeAll(() => {
      originalWindowLocation = WINDOW.location;
      // @ts-expect-error Override delete
      delete WINDOW.location;
      // @ts-expect-error We are missing some fields of the Origin interface but it doesn't matter for these tests.
      WINDOW.location = new URL('https://my-origin.com');
    });

    afterAll(() => {
      WINDOW.location = originalWindowLocation;
    });

    it.each([
      'https://my-origin.com',
      'https://my-origin.com/test',
      '/',
      '/api/test',
      '//my-origin.com/',
      '//my-origin.com/test',
      'foobar', // this is a relative request
      'not-my-origin.com', // this is a relative request
      'not-my-origin.com/api/test', // this is a relative request
    ])('should return `true` for same-origin URLs (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(true);
    });

    it.each([
      'http://my-origin.com', // wrong protocol
      'http://my-origin.com/api', // wrong protocol
      'http://localhost:3000',
      '//not-my-origin.com/test',
      'https://somewhere.com/test/localhost/123',
      'https://somewhere.com/test?url=https://my-origin.com',
      '//example.com',
    ])('should return `false` for cross-origin URLs (%s)', url => {
      expect(shouldAttachHeaders(url, undefined)).toBe(false);
    });
  });

  describe('with `tracePropagationTargets`', () => {
    let originalWindowLocation: Location;

    beforeAll(() => {
      originalWindowLocation = WINDOW.location;
      // @ts-expect-error Override delete
      delete WINDOW.location;
      // @ts-expect-error We are missing some fields of the Origin interface but it doesn't matter for these tests.
      WINDOW.location = new URL('https://my-origin.com/api/my-route');
    });

    afterAll(() => {
      WINDOW.location = originalWindowLocation;
    });

    it.each([
      ['https://my-origin.com', /^\//, true], // pathname defaults to "/"
      ['https://my-origin.com/', /^\//, true],
      ['https://not-my-origin.com', /^\//, false], // pathname does not match in isolation for cross origin
      ['https://not-my-origin.com/', /^\//, false], // pathname does not match in isolation for cross origin

      ['http://my-origin.com/', /^\//, false], // different protocol than origin

      ['//my-origin.com', /^\//, true], // pathname defaults to "/"
      ['//my-origin.com/', /^\//, true], // matches pathname
      ['//not-my-origin.com', /^\//, false],
      ['//not-my-origin.com/', /^\//, false], // different origin should not match pathname

      ['//my-origin.com', /^https:/, true],
      ['//not-my-origin.com', /^https:/, true],
      ['//my-origin.com', /^http:/, false],
      ['//not-my-origin.com', /^http:/, false],

      ['https://my-origin.com/api', /^\/api/, true],
      ['https://not-my-origin.com/api', /^\/api/, false], // different origin should not match pathname in isolation

      ['https://my-origin.com/api', /api/, true],
      ['https://not-my-origin.com/api', /api/, true],

      ['/api', /^\/api/, true], // matches pathname
      ['/api', /\/\/my-origin\.com\/api/, true], // matches full url
      ['foobar', /\/foobar/, true], // matches full url
      ['foobar', /^\/api\/foobar/, true], // full url match
      ['some-url.com', /\/some-url\.com/, true],
      ['some-url.com', /^\/some-url\.com/, false], // does not match pathname or full url
      ['some-url.com', /^\/api\/some-url\.com/, true], // matches pathname

      ['/api', /^http:/, false],
      ['foobar', /^http:/, false],
      ['some-url.com', /^http:/, false],
      ['/api', /^https:/, true],
      ['foobar', /^https:/, true],
      ['some-url.com', /^https:/, true],

      ['https://my-origin.com', 'my-origin', true],
      ['https://not-my-origin.com', 'my-origin', true],
      ['https://my-origin.com', 'not-my-origin', false],
      ['https://not-my-origin.com', 'not-my-origin', true],

      ['https://my-origin.com', 'https', true],
      ['https://my-origin.com', 'http', true], // partially matches https
      ['//my-origin.com', 'https', true],
      ['//my-origin.com', 'http', true], // partially matches https

      ['/api', '/api', true],
      ['api', '/api', true], // full url match
      ['https://not-my-origin.com/api', 'api', true],
      ['https://my-origin.com?my-query', 'my-query', true],
      ['https://not-my-origin.com?my-query', 'my-query', true],
    ])(
      'for url %p and tracePropagationTarget %p on page "https://my-origin.com/api/my-route" should return %p',
      (url, matcher, result) => {
        expect(shouldAttachHeaders(url, [matcher])).toBe(result);
      },
    );
  });

  it.each([
    'https://my-origin.com',
    'https://my-origin.com/',
    'https://not-my-origin.com',
    'https://not-my-origin.com/',
    'http://my-origin.com/',
    '//my-origin.com',
    '//my-origin.com/',
    '//not-my-origin.com',
    '//not-my-origin.com/',
    '//my-origin.com',
    '//not-my-origin.com',
    '//my-origin.com',
    '//not-my-origin.com',
    'https://my-origin.com/api',
    'https://not-my-origin.com/api',
    'https://my-origin.com/api',
    'https://not-my-origin.com/api',
    '/api',
    '/api',
    'foobar',
    'foobar',
    'some-url.com',
    'some-url.com',
    'some-url.com',
    '/api',
    'foobar',
    'some-url.com',
    '/api',
    'foobar',
    'some-url.com',
    'https://my-origin.com',
    'https://not-my-origin.com',
    'https://my-origin.com',
    'https://not-my-origin.com',
    'https://my-origin.com',
    'https://my-origin.com',
    '//my-origin.com',
    '//my-origin.com',
    '/api',
    'api',
    'https://not-my-origin.com/api',
    'https://my-origin.com?my-query',
    'https://not-my-origin.com?my-query',
  ])('should return false for everything if tracePropagationTargets are empty (%p)', url => {
    expect(shouldAttachHeaders(url, [])).toBe(false);
  });

  describe('when window.location.href is not available', () => {
    let originalWindowLocation: Location;

    beforeAll(() => {
      originalWindowLocation = WINDOW.location;
      // @ts-expect-error Override delete
      delete WINDOW.location;
      // @ts-expect-error We need to simulate an edge-case
      WINDOW.location = undefined;
    });

    afterAll(() => {
      WINDOW.location = originalWindowLocation;
    });

    describe('with no defined `tracePropagationTargets`', () => {
      it.each([
        ['https://my-origin.com', false],
        ['https://my-origin.com/test', false],
        ['/', true],
        ['/api/test', true],
        ['//my-origin.com/', false],
        ['//my-origin.com/test', false],
        ['//not-my-origin.com/test', false],
        ['foobar', false],
        ['not-my-origin.com', false],
        ['not-my-origin.com/api/test', false],
        ['http://my-origin.com', false],
        ['http://my-origin.com/api', false],
        ['http://localhost:3000', false],
        ['https://somewhere.com/test/localhost/123', false],
        ['https://somewhere.com/test?url=https://my-origin.com', false],
      ])('for URL %p should return %p', (url, expectedResult) => {
        expect(shouldAttachHeaders(url, undefined)).toBe(expectedResult);
      });
    });

    // Here we should only quite literally match the provided urls
    it.each([
      ['https://my-origin.com', /^\//, false],
      ['https://my-origin.com/', /^\//, false],
      ['https://not-my-origin.com', /^\//, false],
      ['https://not-my-origin.com/', /^\//, false],

      ['http://my-origin.com/', /^\//, false],

      // It is arguably bad that these match, at the same time, these targets are very unusual in environments without location.
      ['//my-origin.com', /^\//, true],
      ['//my-origin.com/', /^\//, true],
      ['//not-my-origin.com', /^\//, true],
      ['//not-my-origin.com/', /^\//, true],

      ['//my-origin.com', /^https:/, false],
      ['//not-my-origin.com', /^https:/, false],
      ['//my-origin.com', /^http:/, false],
      ['//not-my-origin.com', /^http:/, false],

      ['https://my-origin.com/api', /^\/api/, false],
      ['https://not-my-origin.com/api', /^\/api/, false],

      ['https://my-origin.com/api', /api/, true],
      ['https://not-my-origin.com/api', /api/, true],

      ['/api', /^\/api/, true],
      ['/api', /\/\/my-origin\.com\/api/, false],
      ['foobar', /\/foobar/, false],
      ['foobar', /^\/api\/foobar/, false],
      ['some-url.com', /\/some-url\.com/, false],
      ['some-url.com', /^\/some-url\.com/, false],
      ['some-url.com', /^\/api\/some-url\.com/, false],

      ['/api', /^http:/, false],
      ['foobar', /^http:/, false],
      ['some-url.com', /^http:/, false],
      ['/api', /^https:/, false],
      ['foobar', /^https:/, false],
      ['some-url.com', /^https:/, false],

      ['https://my-origin.com', 'my-origin', true],
      ['https://not-my-origin.com', 'my-origin', true],
      ['https://my-origin.com', 'not-my-origin', false],
      ['https://not-my-origin.com', 'not-my-origin', true],

      ['https://my-origin.com', 'https', true],
      ['https://my-origin.com', 'http', true],
      ['//my-origin.com', 'https', false],
      ['//my-origin.com', 'http', false],

      ['/api', '/api', true],
      ['api', '/api', false],
      ['https://not-my-origin.com/api', 'api', true],
      ['https://my-origin.com?my-query', 'my-query', true],
      ['https://not-my-origin.com?my-query', 'my-query', true],
    ])('for url %p and tracePropagationTarget %p should return %p', (url, matcher, result) => {
      expect(shouldAttachHeaders(url, [matcher])).toBe(result);
    });
  });
});
