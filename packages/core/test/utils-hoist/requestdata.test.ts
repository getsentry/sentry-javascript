/* eslint-disable deprecation/deprecation */
import { extractPathForTransaction } from '../../src';
import type { PolymorphicRequest, TransactionSource } from '../../src/types-hoist';
import { getClientIPAddress } from '../../src/utils-hoist/vendor/getIpAddress';

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
      // eslint-disable-next-line deprecation/deprecation
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

    // eslint-disable-next-line deprecation/deprecation
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
