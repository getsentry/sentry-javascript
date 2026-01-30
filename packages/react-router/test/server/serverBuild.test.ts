import { afterEach, describe, expect, it } from 'vitest';
import { _resetServerBuild, getMiddlewareName, isServerBuildLike, setServerBuild } from '../../src/server/serverBuild';

describe('serverBuild', () => {
  afterEach(() => {
    _resetServerBuild();
  });

  describe('setServerBuild', () => {
    it('should store the build reference', () => {
      const mockBuild = {
        routes: {
          'test-route': {
            id: 'test-route',
            module: {
              middleware: [{ name: 'testMiddleware' }],
            },
          },
        },
      };

      setServerBuild(mockBuild);

      expect(getMiddlewareName('test-route', 0)).toBe('testMiddleware');
    });
  });

  describe('getMiddlewareName', () => {
    it('should return undefined when no build is stored', () => {
      expect(getMiddlewareName('any-route', 0)).toBeUndefined();
    });

    it('should return undefined when routes is undefined', () => {
      setServerBuild({});
      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return undefined when route does not exist', () => {
      setServerBuild({
        routes: {
          'other-route': { module: { middleware: [{ name: 'test' }] } },
        },
      });

      expect(getMiddlewareName('non-existent-route', 0)).toBeUndefined();
    });

    it('should return undefined when route has no module', () => {
      setServerBuild({
        routes: {
          'test-route': {},
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return undefined when module has no middleware', () => {
      setServerBuild({
        routes: {
          'test-route': { module: {} },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return undefined when middleware array is empty', () => {
      setServerBuild({
        routes: {
          'test-route': { module: { middleware: [] } },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return undefined when index is out of bounds', () => {
      setServerBuild({
        routes: {
          'test-route': { module: { middleware: [{ name: 'first' }] } },
        },
      });

      expect(getMiddlewareName('test-route', 1)).toBeUndefined();
    });

    it('should return undefined when middleware function has no name', () => {
      setServerBuild({
        routes: {
          'test-route': { module: { middleware: [{}] } },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return undefined when middleware function name is empty string', () => {
      setServerBuild({
        routes: {
          'test-route': { module: { middleware: [{ name: '' }] } },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });

    it('should return the middleware function name', () => {
      setServerBuild({
        routes: {
          'test-route': {
            module: {
              middleware: [{ name: 'authMiddleware' }, { name: 'loggingMiddleware' }],
            },
          },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBe('authMiddleware');
      expect(getMiddlewareName('test-route', 1)).toBe('loggingMiddleware');
    });

    it('should work with multiple routes', () => {
      setServerBuild({
        routes: {
          'route-a': { module: { middleware: [{ name: 'middlewareA' }] } },
          'route-b': { module: { middleware: [{ name: 'middlewareB' }] } },
        },
      });

      expect(getMiddlewareName('route-a', 0)).toBe('middlewareA');
      expect(getMiddlewareName('route-b', 0)).toBe('middlewareB');
    });
  });

  describe('_resetServerBuild', () => {
    it('should clear the stored build reference', () => {
      setServerBuild({
        routes: {
          'test-route': { module: { middleware: [{ name: 'test' }] } },
        },
      });

      expect(getMiddlewareName('test-route', 0)).toBe('test');

      _resetServerBuild();

      expect(getMiddlewareName('test-route', 0)).toBeUndefined();
    });
  });

  describe('isServerBuildLike', () => {
    it('should return true for objects with routes property', () => {
      expect(isServerBuildLike({ routes: {} })).toBe(true);
      expect(isServerBuildLike({ routes: { 'test-route': {} } })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isServerBuildLike(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isServerBuildLike(undefined)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isServerBuildLike('string')).toBe(false);
      expect(isServerBuildLike(123)).toBe(false);
      expect(isServerBuildLike(true)).toBe(false);
    });

    it('should return false for objects without routes property', () => {
      expect(isServerBuildLike({})).toBe(false);
      expect(isServerBuildLike({ other: 'property' })).toBe(false);
    });

    it('should return false when routes is not an object', () => {
      expect(isServerBuildLike({ routes: 'string' })).toBe(false);
      expect(isServerBuildLike({ routes: 123 })).toBe(false);
      expect(isServerBuildLike({ routes: null })).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isServerBuildLike([])).toBe(false);
      expect(isServerBuildLike([{ routes: {} }])).toBe(false);
    });
  });
});
