/* eslint-disable deprecation/deprecation */

// TODO (v8 / #5257): Remove everything related to the deprecated functions

import type { Event, PolymorphicRequest, TransactionSource, User } from '@sentry/types';
import type * as net from 'net';

import type { AddRequestDataToEventOptions } from '../src/requestdata';
import {
  addRequestDataToEvent,
  extractPathForTransaction,
  extractRequestData as newExtractRequestData,
} from '../src/requestdata';
import type { ExpressRequest } from '../src/requestDataDeprecated';
import { extractRequestData as oldExtractRequestData, parseRequest } from '../src/requestDataDeprecated';

// TODO (v8 / #5257): Remove `describe.each` wrapper, remove `formatArgs` wrapper, reformat args in tests, and use only
// `addRequestDataToEvent`
describe.each([parseRequest, addRequestDataToEvent])(
  'backwards compatibility of `parseRequest` rename and move',
  fn => {
    /** Rearrage and cast args correctly for each version of the function */
    function formatArgs(
      fn: typeof parseRequest | typeof addRequestDataToEvent,
      event: Event,
      req: any,
      include?: AddRequestDataToEventOptions['include'],
    ): Parameters<typeof parseRequest> | Parameters<typeof addRequestDataToEvent> {
      if (fn.name === 'parseRequest') {
        return [event, req as ExpressRequest, include];
      } else {
        return [event, req as PolymorphicRequest, { include }];
      }
    }

    describe(fn, () => {
      let mockEvent: Event;
      let mockReq: { [key: string]: any };

      beforeEach(() => {
        mockEvent = {};
        mockReq = {
          baseUrl: '/routerMountPath',
          body: 'foo',
          cookies: { test: 'test' },
          headers: {
            host: 'mattrobenolt.com',
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

      describe(`${fn.name}.user properties`, () => {
        const DEFAULT_USER_KEYS = ['id', 'username', 'email'];
        const CUSTOM_USER_KEYS = ['custom_property'];

        test(`${fn.name}.user only contains the default properties from the user`, () => {
          const [event, req, options] = formatArgs(fn, mockEvent, mockReq);
          const parsedRequest: Event = fn(event, req, options);

          expect(Object.keys(parsedRequest.user as User)).toEqual(DEFAULT_USER_KEYS);
        });

        test(`${fn.name}.user only contains the custom properties specified in the options.user array`, () => {
          const optionsWithCustomUserKeys = {
            user: CUSTOM_USER_KEYS,
          };

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq, optionsWithCustomUserKeys);
          const parsedRequest: Event = fn(event, req, options);

          expect(Object.keys(parsedRequest.user as User)).toEqual(CUSTOM_USER_KEYS);
        });

        test(`${fn.name}.user doesnt blow up when someone passes non-object value`, () => {
          const reqWithUser = {
            ...mockReq,
            // @ts-ignore user is not assignable to object
            user: 'wat',
          };

          const [event, req, options] = formatArgs(fn, mockEvent, reqWithUser);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.user).toBeUndefined();
        });
      });

      describe(`${fn.name}.ip property`, () => {
        test('can be extracted from req.ip', () => {
          const mockReqWithIP = {
            ...mockReq,
            ip: '123',
          };
          const optionsWithIP = {
            ip: true,
          };

          const [event, req, options] = formatArgs(fn, mockEvent, mockReqWithIP, optionsWithIP);
          const parsedRequest: Event = fn(event, req, options);

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
            ip: true,
          };

          const [event, req, options] = formatArgs(fn, mockEvent, reqWithIPInSocket, optionsWithIP);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.user!.ip_address).toEqual('321');
        });
      });

      describe(`${fn.name}.request properties`, () => {
        test(`${fn.name}.request only contains the default set of properties from the request`, () => {
          const DEFAULT_REQUEST_PROPERTIES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq);
          const parsedRequest: Event = fn(event, req, options);

          expect(Object.keys(parsedRequest.request!)).toEqual(DEFAULT_REQUEST_PROPERTIES);
        });

        test(`${fn.name}.request only contains the specified properties in the options.request array`, () => {
          const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
          const optionsWithRequestIncludes = {
            request: INCLUDED_PROPERTIES,
          };

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq, optionsWithRequestIncludes);
          const parsedRequest: Event = fn(event, req, options);

          expect(Object.keys(parsedRequest.request!)).toEqual(INCLUDED_PROPERTIES);
        });

        test.each([
          [undefined, true],
          ['GET', false],
          ['HEAD', false],
        ])(
          `${fn.name}.request skips \`body\` property for GET and HEAD requests - %s method`,
          (method, shouldIncludeBodyData) => {
            const reqWithMethod = { ...mockReq, method };

            const [event, req, options] = formatArgs(fn, mockEvent, reqWithMethod);
            const parsedRequest: Event = fn(event, req, options);

            if (shouldIncludeBodyData) {
              expect(parsedRequest.request).toHaveProperty('data');
            } else {
              expect(parsedRequest.request).not.toHaveProperty('data');
            }
          },
        );
      });

      describe(`${fn.name}.transaction property`, () => {
        test('extracts method and full route path by default`', () => {
          const [event, req, options] = formatArgs(fn, mockEvent, mockReq);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/:parameterName');
        });

        test('extracts method and full path by default when mountpoint is `/`', () => {
          mockReq.originalUrl = mockReq.originalUrl.replace('/routerMountpath', '');
          mockReq.baseUrl = '';

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq);
          const parsedRequest: Event = fn(event, req, options);

          // `subpath/` is the full path here, because there's no router mount path
          expect(parsedRequest.transaction).toEqual('POST /subpath/:parameterName');
        });

        test('fallback to method and `originalUrl` if route is missing', () => {
          delete mockReq.route;

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/specificValue');
        });

        test('can extract path only instead if configured', () => {
          const optionsWithPathTransaction = { transaction: 'path' } as const;

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq, optionsWithPathTransaction);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.transaction).toEqual('/routerMountPath/subpath/:parameterName');
        });

        test('can extract handler name instead if configured', () => {
          const optionsWithHandlerTransaction = { transaction: 'handler' } as const;

          const [event, req, options] = formatArgs(fn, mockEvent, mockReq, optionsWithHandlerTransaction);
          const parsedRequest: Event = fn(event, req, options);

          expect(parsedRequest.transaction).toEqual('parameterNameRouteHandler');
        });
      });
    });
  },
);

// TODO (v8 / #5257): Remove `describe.each` wrapper, remove `formatArgs` wrapper, reformat args in tests, use only
// `newExtractRequestData`, and rename `newExtractRequestData` to just `extractRequestData`
Object.defineProperty(oldExtractRequestData, 'name', {
  value: 'oldExtractRequestData',
});
Object.defineProperty(newExtractRequestData, 'name', {
  value: 'newExtractRequestData',
});
describe.each([oldExtractRequestData, newExtractRequestData])(
  'backwards compatibility of `extractRequestData` move',
  fn => {
    /** Rearrage and cast args correctly for each version of the function */
    function formatArgs(
      fn: typeof oldExtractRequestData | typeof newExtractRequestData,
      req: any,
      include?: string[],
    ): Parameters<typeof oldExtractRequestData> | Parameters<typeof newExtractRequestData> {
      if (fn.name === 'oldExtractRequestData') {
        return [req as ExpressRequest, include] as Parameters<typeof oldExtractRequestData>;
      } else {
        return [req as PolymorphicRequest, { include }] as Parameters<typeof newExtractRequestData>;
      }
    }

    describe(fn, () => {
      describe('default behaviour', () => {
        test('node', () => {
          const mockReq = {
            headers: { host: 'example.com' },
            method: 'GET',
            socket: { encrypted: true },
            originalUrl: '/',
          };

          const [req, options] = formatArgs(fn, mockReq);

          expect(fn(req, options as any)).toEqual({
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

          const [req, options] = formatArgs(fn, mockReq);

          expect(fn(req, options as any)).toEqual({
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
          const optionsWithCookies = ['headers'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCookies);

          expect(fn(req, options as any)).toStrictEqual({
            headers: { otherHeader: 'hello' },
          });
        });

        it('includes the `Cookie` header in requestdata.headers, if `cookies` is not set in the options', () => {
          const mockReq = {
            cookies: { foo: 'bar' },
            headers: { cookie: 'foo=bar', otherHeader: 'hello' },
          };
          const optionsWithCookies = ['headers', 'cookies'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCookies);

          expect(fn(req, options as any)).toStrictEqual({
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
          const optionsWithCookies = ['cookies'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCookies);

          expect(fn(req, options as any)).toEqual({
            cookies: { foo: 'bar' },
          });
        });

        it('parses the cookie header', () => {
          const mockReq = {
            headers: {
              cookie: 'foo=bar;',
            },
          };
          const optionsWithCookies = ['cookies'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCookies);

          expect(fn(req, options as any)).toEqual({
            cookies: { foo: 'bar' },
          });
        });

        it('falls back if no cookies are defined', () => {
          const mockReq = {};
          const optionsWithCookies = ['cookies'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCookies);

          expect(fn(req, options as any)).toEqual({
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
          const optionsWithData = ['data'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithData);

          expect(fn(req, options as any)).toEqual({
            data: 'foo=bar',
          });
        });

        it('encodes JSON body contents back to a string', () => {
          const mockReq = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { foo: 'bar' },
          };
          const optionsWithData = ['data'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithData);

          expect(fn(req, options as any)).toEqual({
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
          const optionsWithQueryString = ['query_string'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithQueryString);

          expect(fn(req, options as any)).toEqual({
            query_string: 'foo=bar',
          });
        });

        it('gracefully degrades if url cannot be determined', () => {
          const mockReq = {};
          const optionsWithQueryString = ['query_string'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithQueryString);

          expect(fn(req, options as any)).toEqual({
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
          const optionsWithURL = ['url'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithURL);

          expect(fn(req, options as any)).toEqual({
            url: 'https://example.com/',
          });
        });

        test('node', () => {
          const mockReq = {
            headers: { host: 'example.com' },
            socket: { encrypted: true },
            originalUrl: '/',
          };
          const optionsWithURL = ['url'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithURL);

          expect(fn(req, options as any)).toEqual({
            url: 'https://example.com/',
          });
        });
      });

      describe('custom key', () => {
        it('includes the custom key if present', () => {
          const mockReq = {
            httpVersion: '1.1',
          };
          const optionsWithCustomKey = ['httpVersion'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCustomKey);

          expect(fn(req, options as any)).toEqual({
            httpVersion: '1.1',
          });
        });

        it('gracefully degrades if the custom key is missing', () => {
          const mockReq = {};
          const optionsWithCustomKey = ['httpVersion'];

          const [req, options] = formatArgs(fn, mockReq, optionsWithCustomKey);

          expect(fn(req, options as any)).toEqual({});
        });
      });
    });
  },
);

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
