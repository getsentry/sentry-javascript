import type * as net from 'net';
import type { Event, PolymorphicRequest, TransactionSource, User } from '@sentry/types';
import { addRequestDataToEvent, extractPathForTransaction, extractRequestData } from '@sentry/utils';
import { getClientIPAddress } from '../src/vendor/getIpAddress';

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

    test.each([
      'X-Client-IP',
      'X-Forwarded-For',
      'Fly-Client-IP',
      'CF-Connecting-IP',
      'Fastly-Client-Ip',
      'True-Client-Ip',
      'X-Real-IP',
      'X-Cluster-Client-IP',
      'X-Forwarded',
      'Forwarded-For',
      'X-Vercel-Forwarded-For',
    ])('can be extracted from %s header', headerName => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          [headerName]: '123.5.6.1',
        },
      };

      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('123.5.6.1');
    });

    it('can be extracted from Forwarded header', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          Forwarded: 'by=111;for=123.5.6.1;for=123.5.6.2;',
        },
      };

      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('123.5.6.1');
    });

    test('it ignores invalid IP in header', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          'X-Client-IP': 'invalid',
        },
      };

      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual(undefined);
    });

    test('IP from header takes presedence over socket', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          'X-Client-IP': '123.5.6.1',
        },
        socket: {
          remoteAddress: '321',
        } as net.Socket,
      };

      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('123.5.6.1');
    });

    test('IP from header takes presedence over req.ip', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          'X-Client-IP': '123.5.6.1',
        },
        ip: '123',
      };

      const optionsWithIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithIP);

      expect(parsedRequest.user!.ip_address).toEqual('123.5.6.1');
    });

    test('does not add IP if ip=false', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          'X-Client-IP': '123.5.6.1',
        },
        ip: '123',
      };

      const optionsWithoutIP = {
        include: {
          ip: false,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithoutIP);

      expect(parsedRequest.user!.ip_address).toEqual(undefined);
    });

    test('does not add IP by default', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          'X-Client-IP': '123.5.6.1',
        },
        ip: '123',
      };

      const optionsWithoutIP = {};

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithoutIP);

      expect(parsedRequest.user!.ip_address).toEqual(undefined);
    });

    test('removes IP headers if `ip` is not set in the options', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          otherHeader: 'hello',
          'X-Client-IP': '123',
          'X-Forwarded-For': '123',
          'Fly-Client-IP': '123',
          'CF-Connecting-IP': '123',
          'Fastly-Client-Ip': '123',
          'True-Client-Ip': '123',
          'X-Real-IP': '123',
          'X-Cluster-Client-IP': '123',
          'X-Forwarded': '123',
          'Forwarded-For': '123',
          Forwarded: '123',
          'X-Vercel-Forwarded-For': '123',
        },
      };

      const optionsWithoutIP = {
        include: {},
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithoutIP);

      expect(parsedRequest.request?.headers).toEqual({ otherHeader: 'hello' });
    });

    test('keeps IP headers if `ip=true`', () => {
      const reqWithIPInHeader = {
        ...mockReq,
        headers: {
          otherHeader: 'hello',
          'X-Client-IP': '123',
          'X-Forwarded-For': '123',
          'Fly-Client-IP': '123',
          'CF-Connecting-IP': '123',
          'Fastly-Client-Ip': '123',
          'True-Client-Ip': '123',
          'X-Real-IP': '123',
          'X-Cluster-Client-IP': '123',
          'X-Forwarded': '123',
          'Forwarded-For': '123',
          Forwarded: '123',
          'X-Vercel-Forwarded-For': '123',
        },
      };

      const optionsWithoutIP = {
        include: {
          ip: true,
        },
      };

      const parsedRequest: Event = addRequestDataToEvent(mockEvent, reqWithIPInHeader, optionsWithoutIP);

      expect(parsedRequest.request?.headers).toEqual({
        otherHeader: 'hello',
        'X-Client-IP': '123',
        'X-Forwarded-For': '123',
        'Fly-Client-IP': '123',
        'CF-Connecting-IP': '123',
        'Fastly-Client-Ip': '123',
        'True-Client-Ip': '123',
        'X-Real-IP': '123',
        'X-Cluster-Client-IP': '123',
        'X-Forwarded': '123',
        'Forwarded-For': '123',
        Forwarded: '123',
        'X-Vercel-Forwarded-For': '123',
      });
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

    it('removes IP-related headers from requestdata.headers, if `ip` is not set in the options', () => {
      const mockReq = {
        headers: {
          otherHeader: 'hello',
          'X-Client-IP': '123',
          'X-Forwarded-For': '123',
          'Fly-Client-IP': '123',
          'CF-Connecting-IP': '123',
          'Fastly-Client-Ip': '123',
          'True-Client-Ip': '123',
          'X-Real-IP': '123',
          'X-Cluster-Client-IP': '123',
          'X-Forwarded': '123',
          'Forwarded-For': '123',
          Forwarded: '123',
          'X-Vercel-Forwarded-For': '123',
        },
      };
      const options = { include: ['headers'] };

      expect(extractRequestData(mockReq, options)).toStrictEqual({
        headers: { otherHeader: 'hello' },
      });
    });

    it('keeps IP-related headers from requestdata.headers, if `ip` is enabled in options', () => {
      const mockReq = {
        headers: {
          otherHeader: 'hello',
          'X-Client-IP': '123',
          'X-Forwarded-For': '123',
          'Fly-Client-IP': '123',
          'CF-Connecting-IP': '123',
          'Fastly-Client-Ip': '123',
          'True-Client-Ip': '123',
          'X-Real-IP': '123',
          'X-Cluster-Client-IP': '123',
          'X-Forwarded': '123',
          'Forwarded-For': '123',
          Forwarded: '123',
          'X-Vercel-Forwarded-For': '123',
        },
      };
      const options = { include: ['headers', 'ip'] };

      expect(extractRequestData(mockReq, options)).toStrictEqual({
        headers: {
          otherHeader: 'hello',
          'X-Client-IP': '123',
          'X-Forwarded-For': '123',
          'Fly-Client-IP': '123',
          'CF-Connecting-IP': '123',
          'Fastly-Client-Ip': '123',
          'True-Client-Ip': '123',
          'X-Real-IP': '123',
          'X-Cluster-Client-IP': '123',
          'X-Forwarded': '123',
          'Forwarded-For': '123',
          Forwarded: '123',
          'X-Vercel-Forwarded-For': '123',
        },
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

describe('getClientIPAddress', () => {
  it.each([
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5,2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5, 141.101.69.35',
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
    ],
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5,   2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5, 141.101.69.35',
      '2b01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
    ],
    [
      '2a01:cb19:8350:ed00:d0dd:INVALID_IP_ADDR:8be5,141.101.69.35,2a01:cb19:8350:ed00:d0dd:fa5b:de31:8be5',
      '141.101.69.35',
    ],
    [
      '2b01:cb19:8350:ed00:d0dd:fa5b:nope:8be5,   2b01:cb19:NOPE:ed00:d0dd:fa5b:de31:8be5,   141.101.69.35  ',
      '141.101.69.35',
    ],
    ['2b01:cb19:8350:ed00:d0 dd:fa5b:de31:8be5, 141.101.69.35', '141.101.69.35'],
  ])('should parse the IP from the X-Forwarded-For header %s', (headerValue, expectedIP) => {
    const headers = {
      'X-Forwarded-For': headerValue,
    };

    const ip = getClientIPAddress(headers);

    expect(ip).toEqual(expectedIP);
  });
});
