import { extractLayerPath } from '../../src/node/integrations/express';

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
describe('unit Test for extractLayerPath', () => {
  it('should return api segment', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '';
    const layerPath = '/api';
    const result = extractLayerPath(originalUrl, reconstructedRoute, layerPath);
    expect(result).toBe('api');
  });

  it('should prevent duplicate segment api', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '/api';
    const layerPath = '/api/v1';
    const result = extractLayerPath(originalUrl, reconstructedRoute, layerPath);
    expect(result).toBe('v1');
  });

  it('should prevent duplicate segment v1', () => {
    const originalUrl = '/api/v1/1234';
    const reconstructedRoute = '/api/v1';
    const layerPath = '/v1/1234';
    const result1 = extractLayerPath(originalUrl, reconstructedRoute, layerPath);
    expect(result1).toBe('1234');
  });
});
describe('extractLayerPath should handle empty input gracefully', () => {
  it('Empty input values', () => {
    expect(extractLayerPath()).toBeUndefined();
  });

  it('Empty originalUrl', () => {
    expect(extractLayerPath('', '/api/v1/1234', '/api/api/v1/1234')).toBe('');
  });

  it('Empty reconstructedRoute', () => {
    expect(extractLayerPath('/api/v1/1234', '', '/api/api/v1/1234')).toBe('api/v1/1234');
  });

  it('Empty layerPath', () => {
    expect(extractLayerPath('/api/v1/1234', '/api/v1/1234', '')).toBe('');
  });
});
