import { extractOriginalRoute, preventDuplicateSegments } from '../../src/node/integrations/express';

/**
 * prevent duplicate segment in _reconstructedRoute param if router match multiple routes before final path
 * example:
 * original url: /api/v1/1234
 * prevent: /api/api/v1/:userId
 * router structure
 * /api -> middleware
 * /api/v1 -> middleware
 * /1234 -> endpoint with param :userId
 * final _reconstructedRoute is /api/v1/:userId
 */
describe('unit Test for preventDuplicateSegments', () => {
  it('should return api segment', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '';
    const layerPath = '/api';
    const result = preventDuplicateSegments(originalUrl, reconstructedRoute, layerPath);
    expect(result).toBe('api');
  });

  it('should prevent duplicate segment api', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '/api';
    const layerPath = '/api/v1';
    const result = preventDuplicateSegments(originalUrl, reconstructedRoute, layerPath);
    expect(result).toBe('v1');
  });

  it('should prevent duplicate segment v1', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '/api/v1';
    const layerPath = '/v1/1234';
    const result1 = preventDuplicateSegments(originalUrl, reconstructedRoute, layerPath);
    expect(result1).toBe('1234');
  });

  it('should prevent duplicate segment v1 originalUrl with query param without trailing slash', () => {
    const originalUrl = '/api/v1/1234?queryParam=123';
    const reconstructedRoute = '/api/v1';
    const layerPath = '/v1/1234';
    const result1 = preventDuplicateSegments(originalUrl, reconstructedRoute, layerPath);
    expect(result1).toBe('1234');
  });

  it('should prevent duplicate segment v1 originalUrl with query param with trailing slash', () => {
    const originalUrl = '/api/v1/1234/?queryParam=123';
    const reconstructedRoute = '/api/v1';
    const layerPath = '/v1/1234';
    const result1 = preventDuplicateSegments(originalUrl, reconstructedRoute, layerPath);
    expect(result1).toBe('1234');
  });
});
describe('preventDuplicateSegments should handle empty input gracefully', () => {
  it('Empty input values', () => {
    expect(preventDuplicateSegments()).toBeUndefined();
  });

  it('Empty originalUrl', () => {
    expect(preventDuplicateSegments('', '/api/v1/1234', '/api/api/v1/1234')).toBe('');
  });

  it('Empty reconstructedRoute', () => {
    expect(preventDuplicateSegments('/api/v1/1234', '', '/api/api/v1/1234')).toBe('api/v1/1234');
  });

  it('Empty layerPath', () => {
    expect(preventDuplicateSegments('/api/v1/1234', '/api/v1/1234', '')).toBe('');
  });
});

// parse node.js major version
const [major] = process.versions.node.split('.').map(Number);
// Test this funciton only if node is 16+ because regex d flag is support from node 16+
if (major >= 16) {
  describe('extractOriginalRoute', () => {
    it('should return undefined if path, regexp, or keys are missing', () => {
      expect(extractOriginalRoute('/example')).toBeUndefined();
      expect(extractOriginalRoute('/example', /test/)).toBeUndefined();
    });

    it('should return undefined if keys do not contain an offset property', () => {
      const path = '/example';
      const regex = /example/;
      const key = { name: 'param1', offset: 0, optional: false };
      expect(extractOriginalRoute(path, regex, [key])).toBeUndefined();
    });

    it('should return the original route path when valid inputs are provided', () => {
      const path = '/router/123';
      const regex = /^\/router\/(\d+)$/;
      const keys = [{ name: 'pathParam', offset: 8, optional: false }];
      expect(extractOriginalRoute(path, regex, keys)).toBe('/router/:pathParam');
    });

    it('should handle multiple parameters in the route', () => {
      const path = '/user/42/profile/username';
      const regex = /^\/user\/(\d+)\/profile\/(\w+)$/;
      const keys = [
        { name: 'userId', offset: 6, optional: false },
        { name: 'username', offset: 17, optional: false },
      ];
      expect(extractOriginalRoute(path, regex, keys)).toBe('/user/:userId/profile/:username');
    });

    it('should handle complex regex scheme extract from array of routes', () => {
      const path1 = '/@fs/*';
      const path2 = '/@vite/client';
      const path3 = '/@react-refresh';
      const path4 = '/manifest.json';

      const regex =
        /(?:^\/manifest\.json\/?(?=\/|$)|^\/@vite\/client\/?(?=\/|$)|^\/@react-refresh\/?(?=\/|$)|^\/src\/(.*)\/?(?=\/|$)|^\/vite\/(.*)\/?(?=\/|$)|^\/node_modules\/(.*)\/?(?=\/|$)|^\/@fs\/(.*)\/?(?=\/|$)|^\/@vite-plugin-checker-runtime\/?(?=\/|$)|^\/?$\/?(?=\/|$)|^\/home\/?$\/?(?=\/|$)|^\/login\/?(?=\/|$))/;
      const keys = [
        { name: 0, offset: 8, optional: false },
        { name: 0, offset: 8, optional: false },
        { name: 0, offset: 9, optional: false },
        { name: 0, offset: 17, optional: false },
      ];

      expect(extractOriginalRoute(path1, regex, keys)).toBe('/@fs/:0');
      expect(extractOriginalRoute(path2, regex, keys)).toBe('/@vite/client');
      expect(extractOriginalRoute(path3, regex, keys)).toBe('/@react-refresh');
      expect(extractOriginalRoute(path4, regex, keys)).toBe('/manifest.json');
    });
  });
}
