import { GLOBAL_OBJ } from '@sentry/core';
import path from 'path';
import { afterEach, describe, expect, test } from 'vitest';
import { maybeParameterizeRoute } from '../../../../../src/client/routing/parameterization';
import { createRouteManifest } from '../../../../../src/config/manifest/createRouteManifest';
import type { RouteManifest } from '../../../../../src/config/manifest/types';

const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
  _sentryRouteManifest: string | undefined;
};

function getRoute(manifest: RouteManifest, routePath: string): RouteManifest['dynamicRoutes'][number] {
  const route = manifest.dynamicRoutes.find(r => r.path === routePath);
  if (!route) {
    throw new Error(`Route ${routePath} not found in manifest`);
  }
  return route;
}

describe('locale-prefix', () => {
  const originalManifest = globalWithInjectedManifest._sentryRouteManifest;

  afterEach(() => {
    globalWithInjectedManifest._sentryRouteManifest = originalManifest;
  });

  describe('default locale param names', () => {
    const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app') });

    test('flags `lng` as an optional prefix', () => {
      expect(getRoute(manifest, '/:lng').hasOptionalPrefix).toBe(true);
      expect(getRoute(manifest, '/:lng/guides/:category/:rest*').hasOptionalPrefix).toBe(true);
      expect(getRoute(manifest, '/:lng/:notFound*').hasOptionalPrefix).toBe(true);
    });

    test('parameterizes unprefixed default-locale paths against the real route, not the catch-all', () => {
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/guides/renting/foo')).toBe('/:lng/guides/:category/:rest*');
      expect(maybeParameterizeRoute('/fr/guides/renting/foo')).toBe('/:lng/guides/:category/:rest*');
      expect(maybeParameterizeRoute('/does/not/exist')).toBe('/:lng/:notFound*');
    });

    test('parameterizes the locale root as the locale page, not the catch-all', () => {
      globalWithInjectedManifest._sentryRouteManifest = JSON.stringify(manifest);

      expect(maybeParameterizeRoute('/')).toBe('/:lng');
      expect(maybeParameterizeRoute('/fr')).toBe('/:lng');
    });
  });

  describe('custom locale param names', () => {
    test('flags configured param names as an optional prefix', () => {
      const manifest = createRouteManifest({
        appDirPath: path.join(__dirname, 'app-custom'),
        localeParamNames: ['loc'],
      });

      expect(getRoute(manifest, '/:loc').hasOptionalPrefix).toBe(true);
      expect(getRoute(manifest, '/:loc/about').hasOptionalPrefix).toBe(true);
    });

    test('replaces rather than extends the defaults', () => {
      const manifest = createRouteManifest({
        appDirPath: path.join(__dirname, 'app'),
        localeParamNames: ['loc'],
      });

      expect(getRoute(manifest, '/:lng').hasOptionalPrefix).toBe(false);
    });

    test('disables optional prefix matching when passed an empty list', () => {
      const manifest = createRouteManifest({ appDirPath: path.join(__dirname, 'app'), localeParamNames: [] });

      expect(getRoute(manifest, '/:lng').hasOptionalPrefix).toBe(false);
    });
  });
});
