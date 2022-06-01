/* eslint-disable deprecation/deprecation */

/* Note: These tests should eventually live in `@sentry/utils`, and can be moved there once the the
 * backwards-compatibility-preserving wrappers in `handlers.ts` are removed.
 */

// TODO (v8 / #5190): Remove everything above

import { addRequestDataToEvent, ExpressRequest, extractRequestData as newExtractRequestData } from '@sentry/utils';
import * as net from 'net';

import { Event, Request, User } from '../src';
import { extractRequestData as oldExtractRequestData, parseRequest } from '../src/handlers';

// TODO (v8 / #5190): Remove `describe.each` wrapper, use only `addRequestDataToEvent`, and move these tests to
// @sentry/utils
describe.each([parseRequest, addRequestDataToEvent])(
  'backwards compatibility of `parseRequest` rename and move',
  fn => {
    describe(fn, () => {
      let mockReq: { [key: string]: any };

      beforeEach(() => {
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
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest);
          expect(Object.keys(parsedRequest.user as User)).toEqual(DEFAULT_USER_KEYS);
        });

        test(`${fn.name}.user only contains the custom properties specified in the options.user array`, () => {
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest, {
            user: CUSTOM_USER_KEYS,
          });
          expect(Object.keys(parsedRequest.user as User)).toEqual(CUSTOM_USER_KEYS);
        });

        test(`${fn.name}.user doesnt blow up when someone passes non-object value`, () => {
          const parsedRequest: Event = fn(
            {},
            {
              ...mockReq,
              // @ts-ignore user is not assignable to object
              user: 'wat',
            },
          );
          expect(Object.keys(parsedRequest.user as User)).toEqual([]);
        });
      });

      describe(`${fn.name}.ip property`, () => {
        test('can be extracted from req.ip', () => {
          const parsedRequest: Event = fn(
            {},
            {
              ...mockReq,
              ip: '123',
            } as ExpressRequest,
            {
              ip: true,
            },
          );
          expect(parsedRequest.user!.ip_address).toEqual('123');
        });

        test('can extract from req.connection.remoteAddress', () => {
          const parsedRequest: Event = fn(
            {},
            {
              ...mockReq,
              connection: {
                remoteAddress: '321',
              } as net.Socket,
            } as ExpressRequest,
            {
              ip: true,
            },
          );
          expect(parsedRequest.user!.ip_address).toEqual('321');
        });
      });

      describe(`${fn.name}.request properties`, () => {
        test(`${fn.name}.request only contains the default set of properties from the request`, () => {
          const DEFAULT_REQUEST_PROPERTIES = ['cookies', 'data', 'headers', 'method', 'query_string', 'url'];
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest);
          expect(Object.keys(parsedRequest.request as Request)).toEqual(DEFAULT_REQUEST_PROPERTIES);
        });

        test(`${fn.name}.request only contains the specified properties in the options.request array`, () => {
          const INCLUDED_PROPERTIES = ['data', 'headers', 'query_string', 'url'];
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest, {
            request: INCLUDED_PROPERTIES,
          });
          expect(Object.keys(parsedRequest.request as Request)).toEqual(INCLUDED_PROPERTIES);
        });

        test(`${fn.name}.request skips \`body\` property for GET and HEAD requests`, () => {
          expect(fn({}, mockReq as ExpressRequest, {}).request).toHaveProperty('data');
          expect(fn({}, { ...mockReq, method: 'GET' } as ExpressRequest, {}).request).not.toHaveProperty('data');
          expect(fn({}, { ...mockReq, method: 'HEAD' } as ExpressRequest, {}).request).not.toHaveProperty('data');
        });
      });

      describe(`${fn.name}.transaction property`, () => {
        test('extracts method and full route path by default`', () => {
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest);
          expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/:parameterName');
        });

        test('extracts method and full path by default when mountpoint is `/`', () => {
          mockReq.originalUrl = mockReq.originalUrl.replace('/routerMountpath', '');
          mockReq.baseUrl = '';
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest);
          // "sub"path is the full path here, because there's no router mount path
          expect(parsedRequest.transaction).toEqual('POST /subpath/:parameterName');
        });

        test('fallback to method and `originalUrl` if route is missing', () => {
          delete mockReq.route;
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest);
          expect(parsedRequest.transaction).toEqual('POST /routerMountPath/subpath/specificValue');
        });

        test('can extract path only instead if configured', () => {
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest, { transaction: 'path' });
          expect(parsedRequest.transaction).toEqual('/routerMountPath/subpath/:parameterName');
        });

        test('can extract handler name instead if configured', () => {
          const parsedRequest: Event = fn({}, mockReq as ExpressRequest, {
            transaction: 'handler',
          });
          expect(parsedRequest.transaction).toEqual('parameterNameRouteHandler');
        });
      });
    });
  },
);

// TODO (v8 / #5190): Remove `describe.each` wrapper, use only `newExtractRequestData`, rename `newExtractRequestData`
// to just `extractRequestData`, and move these tests to @sentry/utils
Object.defineProperty(oldExtractRequestData, 'name', {
  value: 'oldExtractRequestData',
});
Object.defineProperty(newExtractRequestData, 'name', {
  value: 'newExtractRequestData',
});
describe.each([oldExtractRequestData, newExtractRequestData])(
  'backwards compatibility of `extractRequestData` move',
  fn => {
    describe(fn, () => {
      describe('default behaviour', () => {
        test('node', () => {
          expect(
            fn({
              headers: { host: 'example.com' },
              method: 'GET',
              secure: true,
              originalUrl: '/',
            }),
          ).toEqual({
            cookies: {},
            headers: {
              host: 'example.com',
            },
            method: 'GET',
            query_string: null,
            url: 'https://example.com/',
          });
        });

        test('degrades gracefully without request data', () => {
          expect(fn({})).toEqual({
            cookies: {},
            headers: {},
            method: undefined,
            query_string: null,
            url: 'http://<no host>',
          });
        });
      });

      describe('cookies', () => {
        it('uses `req.cookies` if available', () => {
          expect(
            fn(
              {
                cookies: { foo: 'bar' },
              },
              ['cookies'],
            ),
          ).toEqual({
            cookies: { foo: 'bar' },
          });
        });

        it('parses the cookie header', () => {
          expect(
            fn(
              {
                headers: {
                  cookie: 'foo=bar;',
                },
              },
              ['cookies'],
            ),
          ).toEqual({
            cookies: { foo: 'bar' },
          });
        });

        it('falls back if no cookies are defined', () => {
          expect(fn({}, ['cookies'])).toEqual({
            cookies: {},
          });
        });
      });

      describe('data', () => {
        it('includes data from `req.body` if available', () => {
          expect(
            fn(
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'foo=bar',
              },
              ['data'],
            ),
          ).toEqual({
            data: 'foo=bar',
          });
        });

        it('encodes JSON body contents back to a string', () => {
          expect(
            fn(
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: { foo: 'bar' },
              },
              ['data'],
            ),
          ).toEqual({
            data: '{"foo":"bar"}',
          });
        });
      });

      describe('query_string', () => {
        it('parses the query parms from the url', () => {
          expect(
            fn(
              {
                headers: { host: 'example.com' },
                secure: true,
                originalUrl: '/?foo=bar',
              },
              ['query_string'],
            ),
          ).toEqual({
            query_string: 'foo=bar',
          });
        });

        it('gracefully degrades if url cannot be determined', () => {
          expect(fn({}, ['query_string'])).toEqual({
            query_string: null,
          });
        });
      });

      describe('url', () => {
        test('express/koa', () => {
          expect(
            fn(
              {
                host: 'example.com',
                protocol: 'https',
                url: '/',
              },
              ['url'],
            ),
          ).toEqual({
            url: 'https://example.com/',
          });
        });

        test('node', () => {
          expect(
            fn(
              {
                headers: { host: 'example.com' },
                secure: true,
                originalUrl: '/',
              },
              ['url'],
            ),
          ).toEqual({
            url: 'https://example.com/',
          });
        });
      });

      describe('custom key', () => {
        it('includes the custom key if present', () => {
          expect(
            fn(
              {
                httpVersion: '1.1',
              },
              ['httpVersion'],
            ),
          ).toEqual({
            httpVersion: '1.1',
          });
        });

        it('gracefully degrades if the custom key is missing', () => {
          expect(fn({}, ['httpVersion'])).toEqual({});
        });
      });
    });
  },
);
