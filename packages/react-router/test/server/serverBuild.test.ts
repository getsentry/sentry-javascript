import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetServerBuild,
  getMiddlewareName,
  isServerBuildLike,
  registerServerBuildGlobal,
  setServerBuild,
} from '../../src/server/serverBuild';

describe('serverBuild', () => {
  afterEach(() => {
    _resetServerBuild();
  });

  describe('getMiddlewareName', () => {
    it('should return undefined when build is missing or incomplete', () => {
      expect(getMiddlewareName('any-route', 0)).toBeUndefined();

      setServerBuild({ routes: { 'test-route': {} } });
      expect(getMiddlewareName('test-route', 0)).toBeUndefined();

      setServerBuild({ routes: { 'test-route': { module: { middleware: [{ name: 'first' }] } } } });
      expect(getMiddlewareName('test-route', 1)).toBeUndefined();
    });

    it('should return the middleware function name by index', () => {
      setServerBuild({
        routes: {
          'route-a': { module: { middleware: [{ name: 'authMiddleware' }, { name: 'loggingMiddleware' }] } },
        },
      });

      expect(getMiddlewareName('route-a', 0)).toBe('authMiddleware');
      expect(getMiddlewareName('route-a', 1)).toBe('loggingMiddleware');
    });

    it('should return undefined for empty-string middleware names', () => {
      setServerBuild({
        routes: {
          'route-a': { module: { middleware: [{ name: '' }] } },
        },
      });

      expect(getMiddlewareName('route-a', 0)).toBeUndefined();
    });
  });

  describe('isServerBuildLike', () => {
    it('should return true for objects with a routes object', () => {
      expect(isServerBuildLike({ routes: {} })).toBe(true);
      expect(isServerBuildLike({ routes: { 'test-route': {} } })).toBe(true);
    });

    it('should return false for non-build values', () => {
      expect(isServerBuildLike(null)).toBe(false);
      expect(isServerBuildLike(undefined)).toBe(false);
      expect(isServerBuildLike({})).toBe(false);
      expect(isServerBuildLike({ routes: null })).toBe(false);
      expect(isServerBuildLike({ routes: 'string' })).toBe(false);
    });
  });

  describe('registerServerBuildGlobal', () => {
    it('should register a global callback that calls setServerBuild', () => {
      registerServerBuildGlobal();

      const callback = (GLOBAL_OBJ as any).__sentrySetServerBuild;
      expect(typeof callback).toBe('function');

      const build = { routes: { 'test-route': { module: { middleware: [{ name: 'testMiddleware' }] } } } };
      callback(build);

      expect(getMiddlewareName('test-route', 0)).toBe('testMiddleware');
    });
  });
});
