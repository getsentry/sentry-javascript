import type * as net from 'net';
import type { Event, PolymorphicRequest, TransactionSource, User } from '@sentry/types';
import { addRequestDataToEvent, extractPathForTransaction, extractRequestData } from '@sentry/utils';

describe('addRequestDataToEvent', () => {
  let mockEvent: Event;
  let mockReq: { [key: string]: any };

  beforeEach(() => {
    mockEvent = {};
    mockReq = {
      baseUrl: '/routerMountPath',
      body: 'foo',
      cookies: { test: 'test' },
      headers: {
        host: 'example.org',
      },
      method: 'POST',
      originalUrl: '/routerMountPath/subpath/specificValue?querystringKey=querystringValue',
      path: '/subpath/specificValue',
      query: {
        querystringKey: 'querystringValue',
      },
      route: {
        path: '/subpath/:parameterName',
        stack: [
          {
            name: 'parameterNameRouteHandler',
          },
        ],
      },
      url: '/subpath/specificValue?querystringKey=querystringValue',
      user: {
        custom_property: 'foo',
        email: 'tobias@mail.com',
        id: 123,
        username: 'tobias',
      },
    };
  });

  describe('addRequestDataToEvent user properties', () => {
    const DEFAULT_USER_KEYS = ['id', 'username', 'email'];
    const CUSTOM_USER_KEYS = ['custom_property'];

    test('user only contains the default properties from the user', () => {
      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);
      expect(Object.keys(parsedRequest.user as User)).toEqual(DEFAULT_USER_KEYS);
    });

    test('user only contains the custom properties specified in the options.user array', () => {
      const optionsWithCustomUserKeys = {
        include: {
          user: CUSTOM_USER_KEYS,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq, optionsWithCustomUserKeys);

      expect(Object.keys(parsedRequest.user as User)).toEqual(CUSTOM_USER_KEYS);
    });

    test('setting user doesnt blow up when someone passes non-object value', () => {
      const reqWithUser = {
        ...mockReq,
        // intentionally setting user to a non-object value, hence the as any cast
        user: 'wat',
      } as any;

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithUser);

      expect(parsedRequest.user).toBeUndefined();
    });
  });

  describe('addRequestDataToEvent ip property', () => {
    test('can be extracted from req.ip', () => {
      const mockReqWithIP = {
        ...mockReq,
        ip: '123',
      };
      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReqWithIP, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('123');
    });

    test('can extract from req.socket.remoteAddress', () => {
      const reqWithIPInSocket = {
        ...mockReq,
        socket: {
          remoteAddress: '321',
        } as net.Socket,
      };
      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInSocket, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('321');
    });
  });

  describe('request properties', () => {
    test('request only contains the default set of properties from the request', () => {
      const DEFAULT_REQUEST_PROPERTIES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);

      expect(Object.keys(parsedRequest.request!)).toEqual(DEFAULT_REQUEST_PROPERTIES);
    });

    test('request only contains the specified properties in the options.request array', () => {
      const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
      const optionsWithRequestIncludes = {
        include: {
          request: INCLUDED_PROPERTIES,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq, optionsWithRequestIncludes);

      expect(Object.keys(parsedRequest.request!)).toEqual(INCLUDED_PROPERTIES);
    });

    test.each([
      [undefined, true],
      ['GET', false],
      ['HEAD', false],
    ])('request skips `body` property for GET and HEAD requests - %s method', (method, shouldIncludeBodyData) => {
      const reqWithMethod = { ...mockReq, method };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithMethod);

      if (shouldIncludeBodyData) {
        expect(parsedRequest.request).toHaveProperty('data');
      } else {
        expect(parsedRequest.request).not.toHaveProperty('data');
      }
    });
  });

  describe('transaction property', () => {
    describe('for transaction events', () => {
      beforeEach(() => {
        mockEvent.type = 'transaction';
      });

      test('extracts method and full route path by default`', () => {
        const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);

        expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/:parameterName');
      });

      test('extracts method and full path by default when mountpoint is `/`', () => {
        mockReq.originalUrl = mockReq.originalUrl.replace('/routerMountpath', '');
        mockReq.baseUrl = '';

        const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);

        // `subpath/` is the full path here, because there's no router mount path
        expect(parsedRequest.transaction).toEqual('POST /subpath/:parameterName');
      });

      test('fallback to method and `originalUrl` if route is missing', () => {
        delete mockReq.route;

        const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);

        expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/specificValue');
      });

      test('can extract path only instead if configured', () => {
        const optionsWithPathTransaction = {
          include: {
            transaction: 'path',
          },
        } as const;

        const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq, optionsWithPathTransaction);

        expect(parsedRequest.transaction).toEqual('/routerMountPath/subpath/:parameterName');
      });

      test('can extract handler name instead if configured', () => {
        const optionsWithHandlerTransaction = {
          include: {
            transaction: 'handler',
          },
        } as const;

        const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq, optionsWithHandlerTransaction);

        expect(parsedRequest.transaction).toEqual('parameterNameRouteHandler');
      });
    });
    it('transaction is not applied to non-transaction events', () => {
      const parsedRequest: Event = addRequestDataToEvent(mockEvent, mockReq);

      expect(parsedRequest.transaction).toBeUndefined();
    });
  });
});

describe('extractRequestData', () => {
  describe('default behaviour', () => {
    test('node', () => {
      const mockReq = {
        headers: { host: 'example.com' },
        method: 'GET',
        socket: { encrypted: true },
        originalUrl: '/',
      };

      expect(extractRequestData(mockReq)).toEqual({
        cookies: {},
        headers: {
          host: 'example.com',
        },
        method: 'GET',
        query_string: undefined,
        url: 'https://example.com/',
      });
    });

    test('degrades gracefully without request data', () => {
      const mockReq = {};

      expect(extractRequestData(mockReq)).toEqual({
        cookies: {},
        headers: {},
        method: undefined,
        query_string: undefined,
        url: 'http://<no host>',
      });
    });
  });

  describe('headers', () => {
    it('removes the `Cookie` header from requestdata.headers, if `cookies` is not set in the options', () => {
      const mockReq = {
        cookies: { foo: 'bar' },
        headers: { cookie: 'foo=bar', otherHeader: 'hello' },
      };
      const options = { include: ['headers'] };

      expect(extractRequestData(mockReq, options)).toStrictEqual({
        headers: { otherHeader: 'hello' },
      });
    });

    it('includes the `Cookie` header in requestdata.headers, if `cookies` is set in the options', () => {
      const mockReq = {
        cookies: { foo: 'bar' },
        headers: { cookie: 'foo=bar', otherHeader: 'hello' },
      };
      const optionsWithCookies = { include: ['headers', 'cookies'] };

      expect(extractRequestData(mockReq, optionsWithCookies)).toStrictEqual({
        headers: { otherHeader: 'hello', cookie: 'foo=bar' },
        cookies: { foo: 'bar' },
      });
    });
  });

  describe('cookies', () => {
    it('uses `req.cookies` if available', () => {
      const mockReq = {
        cookies: { foo: 'bar' },
      };
      const optionsWithCookies = { include: ['cookies'] };

      expect(extractRequestData(mockReq, optionsWithCookies)).toEqual({
        cookies: { foo: 'bar' },
      });
    });

    it('parses the cookie header', () => {
      const mockReq = {
        headers: {
          cookie: 'foo=bar;',
        },
      };
      const optionsWithCookies = { include: ['cookies'] };

      expect(extractRequestData(mockReq, optionsWithCookies)).toEqual({
        cookies: { foo: 'bar' },
      });
    });

    it('falls back if no cookies are defined', () => {
      const mockReq = {};
      const optionsWithCookies = { include: ['cookies'] };

      expect(extractRequestData(mockReq, optionsWithCookies)).toEqual({
        cookies: {},
      });
    });
  });

  describe('data', () => {
    it('includes data from `req.body` if available', () => {
      const mockReq = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'foo=bar',
      };
      const optionsWithData = { include: ['data'] };

      expect(extractRequestData(mockReq, optionsWithData)).toEqual({
        data: 'foo=bar',
      });
    });

    it('encodes JSON body contents back to a string', () => {
      const mockReq = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { foo: 'bar' },
      };
      const optionsWithData = { include: ['data'] };

      expect(extractRequestData(mockReq, optionsWithData)).toEqual({
        data: '{"foo":"bar"}',
      });
    });
  });

  describe('query_string', () => {
    it('parses the query parms from the url', () => {
      const mockReq = {
        headers: { host: 'example.com' },
        secure: true,
        originalUrl: '/?foo=bar',
      };
      const optionsWithQueryString = { include: ['query_string'] };

      expect(extractRequestData(mockReq, optionsWithQueryString)).toEqual({
        query_string: 'foo=bar',
      });
    });

    it('gracefully degrades if url cannot be determined', () => {
      const mockReq = {};
      const optionsWithQueryString = { include: ['query_string'] };

      expect(extractRequestData(mockReq, optionsWithQueryString)).toEqual({
        query_string: undefined,
      });
    });
  });

  describe('url', () => {
    test('express/koa', () => {
      const mockReq = {
        host: 'example.com',
        protocol: 'https',
        url: '/',
      };
      const optionsWithURL = { include: ['url'] };

      expect(extractRequestData(mockReq, optionsWithURL)).toEqual({
        url: 'https://example.com/',
      });
    });

    test('node', () => {
      const mockReq = {
        headers: { host: 'example.com' },
        socket: { encrypted: true },
        originalUrl: '/',
      };
      const optionsWithURL = { include: ['url'] };

      expect(extractRequestData(mockReq, optionsWithURL)).toEqual({
        url: 'https://example.com/',
      });
    });
  });

  describe('custom key', () => {
    it('includes the custom key if present', () => {
      const mockReq = {
        httpVersion: '1.1',
      } as any;
      const optionsWithCustomKey = { include: ['httpVersion'] };

      expect(extractRequestData(mockReq, optionsWithCustomKey)).toEqual({
        httpVersion: '1.1',
      });
    });

    it('gracefully degrades if the custom key is missing', () => {
      const mockReq = {} as any;
      const optionsWithCustomKey = { include: ['httpVersion'] };

      expect(extractRequestData(mockReq, optionsWithCustomKey)).toEqual({});
    });
  });
});

describe('extractPathForTransaction', () => {
  it.each([
    [
      'extracts a parameterized route and method if available',
      {
        method: 'get',
        baseUrl: '/api/users',
        route: { path: '/:id/details' },
        originalUrl: '/api/users/123/details',
      } as PolymorphicRequest,
      { path: true, method: true },
      'GET /api/users/:id/details',
      'route' as TransactionSource,
    ],
    [
      'ignores the method if specified',
      {
        method: 'get',
        baseUrl: '/api/users',
        route: { path: '/:id/details' },
        originalUrl: '/api/users/123/details',
      } as PolymorphicRequest,
      { path: true, method: false },
      '/api/users/:id/details',
      'route' as TransactionSource,
    ],
    [
      'ignores the path if specified',
      {
        method: 'get',
        baseUrl: '/api/users',
        route: { path: '/:id/details' },
        originalUrl: '/api/users/123/details',
      } as PolymorphicRequest,
      { path: false, method: true },
      'GET',
      'route' as TransactionSource,
    ],
    [
      'returns an empty string if everything should be ignored',
      {
        method: 'get',
        baseUrl: '/api/users',
        route: { path: '/:id/details' },
        originalUrl: '/api/users/123/details',
      } as PolymorphicRequest,
      { path: false, method: false },
      '',
      'route' as TransactionSource,
    ],
    [
      'falls back to the raw URL if no parameterized route is available',
      {
        method: 'get',
        baseUrl: '/api/users',
        originalUrl: '/api/users/123/details',
      } as PolymorphicRequest,
      { path: true, method: true },
      'GET /api/users/123/details',
      'url' as TransactionSource,
    ],
  ])(
    '%s',
    (
      _: string,
      req: PolymorphicRequest,
      options: { path?: boolean; method?: boolean },
      expectedRoute: string,
      expectedSource: TransactionSource,
    ) => {
      const [route, source] = extractPathForTransaction(req, options);

      expect(route).toEqual(expectedRoute);
      expect(source).toEqual(expectedSource);
    },
  );

  it('overrides the requests information with a custom route if specified', () => {
    const req = {
      method: 'get',
      baseUrl: '/api/users',
      route: { path: '/:id/details' },
      originalUrl: '/api/users/123/details',
    } as PolymorphicRequest;

    const [route, source] = extractPathForTransaction(req, {
      path: true,
      method: true,
      customRoute: '/other/path/:id/details',
    });

    expect(route).toEqual('GET /other/path/:id/details');
    expect(source).toEqual('route');
  });
});
