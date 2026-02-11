import type { Client } from '@sentry/core';
import * as utils from '@sentry/core';
import * as browserUtils from '@sentry-internal/browser-utils';
import type { MockInstance } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentOutgoingRequests, shouldAttachHeaders } from '../../src/tracing/request';

beforeAll(() => {
  // @ts-expect-error need to override global Request because it's not in the vi environment (even with an
  // `@vi-environment jsdom` directive, for some reason)
  global.Request = {};
});

class MockClient implements Partial<Client> {
  public addEventProcessor: () => void;
  constructor() {
    // Mock addEventProcessor function
    this.addEventProcessor = vi.fn();
  }
  // @ts-expect-error not returning options for the test
  public getOptions() {
    return {};
  }
}

describe('instrumentOutgoingRequests', () => {
  let client: Client;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MockClient() as unknown as Client;
  });

  it('instruments fetch and xhr requests', () => {
    const addFetchSpy = vi.spyOn(utils, 'addFetchInstrumentationHandler');
    const addXhrSpy = vi.spyOn(browserUtils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests(client);

    expect(addFetchSpy).toHaveBeenCalledWith(expect.any(Function));
    expect(addXhrSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('does not instrument fetch requests if traceFetch is false', () => {
    const addFetchSpy = vi.spyOn(utils, 'addFetchInstrumentationHandler');

    instrumentOutgoingRequests(client, { traceFetch: false });

    expect(addFetchSpy).not.toHaveBeenCalled();
  });

  it('does not instrument xhr requests if traceXHR is false', () => {
    const addXhrSpy = vi.spyOn(browserUtils, 'addXhrInstrumentationHandler');

    instrumentOutgoingRequests(client, { traceXHR: false });

    expect(addXhrSpy).not.toHaveBeenCalled();
  });

  it('does instrument streaming requests if trackFetchStreamPerformance is true', () => {
    const addFetchEndSpy = vi.spyOn(utils, 'addFetchEndInstrumentationHandler');

    instrumentOutgoingRequests(client, { trackFetchStreamPerformance: true });

    expect(addFetchEndSpy).toHaveBeenCalledWith(expect.any(Function));
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
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi.spyOn(utils, 'getLocationHref').mockImplementation(() => 'https://my-origin.com');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
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
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi
        .spyOn(utils, 'getLocationHref')
        .mockImplementation(() => 'https://my-origin.com/api/my-route');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
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
      'for url %j and tracePropagationTarget %j on page "https://my-origin.com/api/my-route" should return %j',
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
  ])('should return false for everything if tracePropagationTargets are empty (%j)', url => {
    expect(shouldAttachHeaders(url, [])).toBe(false);
  });

  describe('when window.location.href is not available', () => {
    let locationHrefSpy: MockInstance;

    beforeEach(() => {
      locationHrefSpy = vi.spyOn(utils, 'getLocationHref').mockImplementation(() => '');
    });

    afterEach(() => {
      locationHrefSpy.mockReset();
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
      ])('for URL %j should return %j', (url, expectedResult) => {
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
    ])('for url %j and tracePropagationTarget %j should return %j', (url, matcher, result) => {
      expect(shouldAttachHeaders(url, [matcher])).toBe(result);
    });
  });
});
