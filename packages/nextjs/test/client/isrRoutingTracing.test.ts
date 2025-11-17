import { WINDOW } from '@sentry/react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { removeIsrSsgTraceMetaTags } from '../../src/client/routing/isrRoutingTracing';
import type { RouteManifest } from '../../src/config/manifest/types';

const globalWithInjectedValues = WINDOW as typeof WINDOW & {
  _sentryRouteManifest: string;
};

describe('isrRoutingTracing', () => {
  let dom: JSDOM;

  beforeEach(() => {
    // Set up a fresh DOM environment for each test
    dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: 'https://example.com/',
    });
    Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(global, 'location', { value: dom.window.location, writable: true });

    // Clear the injected manifest
    delete globalWithInjectedValues._sentryRouteManifest;
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('removeIsrSsgTraceMetaTags', () => {
    const mockManifest: RouteManifest = {
      staticRoutes: [{ path: '/' }, { path: '/blog' }],
      dynamicRoutes: [
        {
          path: '/products/:id',
          regex: '^/products/([^/]+?)(?:/)?$',
          paramNames: ['id'],
          hasOptionalPrefix: false,
        },
        {
          path: '/posts/:slug',
          regex: '^/posts/([^/]+?)(?:/)?$',
          paramNames: ['slug'],
          hasOptionalPrefix: false,
        },
      ],
      isrRoutes: ['/', '/blog', '/products/:id', '/posts/:slug'],
    };

    it('should remove meta tags when on a static ISR route', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      const baggageMeta = dom.window.document.createElement('meta');
      baggageMeta.setAttribute('name', 'baggage');
      baggageMeta.setAttribute('content', 'sentry-trace-id=12345');
      dom.window.document.head.appendChild(baggageMeta);

      // Set up route manifest (as stringified JSON, which is how it's injected in production)
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(mockManifest);

      // Set location to an ISR route
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/blog' },
        writable: true,
      });

      // Call the function
      removeIsrSsgTraceMetaTags();

      // Verify meta tags were removed
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).toBeNull();
      expect(dom.window.document.querySelector('meta[name="baggage"]')).toBeNull();
    });

    it('should remove meta tags when on a dynamic ISR route', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      const baggageMeta = dom.window.document.createElement('meta');
      baggageMeta.setAttribute('name', 'baggage');
      baggageMeta.setAttribute('content', 'sentry-trace-id=12345');
      dom.window.document.head.appendChild(baggageMeta);

      // Set up route manifest
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(mockManifest);

      // Set location to a dynamic ISR route
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/products/123' },
        writable: true,
      });

      // Call the function
      removeIsrSsgTraceMetaTags();

      // Verify meta tags were removed
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).toBeNull();
      expect(dom.window.document.querySelector('meta[name="baggage"]')).toBeNull();
    });

    it('should NOT remove meta tags when on a non-ISR route', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      const baggageMeta = dom.window.document.createElement('meta');
      baggageMeta.setAttribute('name', 'baggage');
      baggageMeta.setAttribute('content', 'sentry-trace-id=12345');
      dom.window.document.head.appendChild(baggageMeta);

      // Set up route manifest
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(mockManifest);

      // Set location to a non-ISR route
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/regular-page' },
        writable: true,
      });

      // Call the function
      removeIsrSsgTraceMetaTags();

      // Verify meta tags were NOT removed
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).not.toBeNull();
      expect(dom.window.document.querySelector('meta[name="baggage"]')).not.toBeNull();
    });

    it('should handle missing manifest gracefully', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      // No manifest set
      // globalWithInjectedValues._sentryRouteManifest is undefined

      // Set location
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/blog' },
        writable: true,
      });

      // Call the function (should not throw)
      expect(() => removeIsrSsgTraceMetaTags()).not.toThrow();

      // Verify meta tags were NOT removed (no manifest means no ISR detection)
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).not.toBeNull();
    });

    it('should handle invalid JSON manifest gracefully', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      // Set up invalid manifest
      globalWithInjectedValues._sentryRouteManifest = 'invalid json {';

      // Set location
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/blog' },
        writable: true,
      });

      // Call the function (should not throw)
      expect(() => removeIsrSsgTraceMetaTags()).not.toThrow();

      // Verify meta tags were NOT removed (invalid manifest means no ISR detection)
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).not.toBeNull();
    });

    it('should handle manifest with no ISR routes', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      // Set up manifest with no ISR routes
      const manifestWithNoISR: RouteManifest = {
        staticRoutes: [{ path: '/' }],
        dynamicRoutes: [],
        isrRoutes: [],
      };
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(manifestWithNoISR);

      // Set location
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/' },
        writable: true,
      });

      // Call the function
      removeIsrSsgTraceMetaTags();

      // Verify meta tags were NOT removed (no ISR routes in manifest)
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).not.toBeNull();
    });

    it('should handle missing meta tags gracefully', () => {
      // Set up DOM without meta tags

      // Set up route manifest
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(mockManifest);

      // Set location to an ISR route
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/blog' },
        writable: true,
      });

      // Call the function (should not throw)
      expect(() => removeIsrSsgTraceMetaTags()).not.toThrow();

      // Verify no errors and still no meta tags
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).toBeNull();
      expect(dom.window.document.querySelector('meta[name="baggage"]')).toBeNull();
    });

    it('should work with parameterized dynamic routes', () => {
      // Set up DOM with meta tags
      const sentryTraceMeta = dom.window.document.createElement('meta');
      sentryTraceMeta.setAttribute('name', 'sentry-trace');
      sentryTraceMeta.setAttribute('content', 'trace-id-12345');
      dom.window.document.head.appendChild(sentryTraceMeta);

      const baggageMeta = dom.window.document.createElement('meta');
      baggageMeta.setAttribute('name', 'baggage');
      baggageMeta.setAttribute('content', 'sentry-trace-id=12345');
      dom.window.document.head.appendChild(baggageMeta);

      // Set up route manifest
      globalWithInjectedValues._sentryRouteManifest = JSON.stringify(mockManifest);

      // Set location to a different dynamic ISR route value
      Object.defineProperty(global, 'location', {
        value: { ...dom.window.location, pathname: '/posts/my-awesome-post' },
        writable: true,
      });

      // Call the function
      removeIsrSsgTraceMetaTags();

      // Verify meta tags were removed (should match /posts/:slug)
      expect(dom.window.document.querySelector('meta[name="sentry-trace"]')).toBeNull();
      expect(dom.window.document.querySelector('meta[name="baggage"]')).toBeNull();
    });
  });
});

