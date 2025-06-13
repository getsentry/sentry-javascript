import { describe, expect, it } from 'vitest';
import {
  buildUrlFromComponentRoute,
  extractSanitizedUrlFromRefererHeader,
  getSanitizedRequestUrl,
  sanitizeRoutePath,
  substituteRouteParams,
} from '../../src/common/utils/urls';

describe('URL Utilities', () => {
  describe('buildUrlFromComponentRoute', () => {
    const mockHeaders = {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'example.com',
      host: 'example.com',
    };

    it('should build URL with protocol and host', () => {
      const result = buildUrlFromComponentRoute('/test', undefined, mockHeaders);
      expect(result).toBe('https://example.com/test');
    });

    it('should handle route parameters', () => {
      const result = buildUrlFromComponentRoute(
        '/users/[id]/posts/[postId]',
        { id: '123', postId: '456' },
        mockHeaders,
      );
      expect(result).toBe('https://example.com/users/123/posts/456');
    });

    it('should handle multiple instances of the same parameter', () => {
      const result = buildUrlFromComponentRoute('/users/[id]/[id]/profile', { id: '123' }, mockHeaders);
      expect(result).toBe('https://example.com/users/123/123/profile');
    });

    it('should handle special characters in parameters', () => {
      const result = buildUrlFromComponentRoute('/search/[query]', { query: 'hello world' }, mockHeaders);
      expect(result).toBe('https://example.com/search/hello%20world');
    });

    it('should handle route groups', () => {
      const result = buildUrlFromComponentRoute('/(auth)/login', undefined, mockHeaders);
      expect(result).toBe('https://example.com/login');
    });

    it('should normalize multiple slashes', () => {
      const result = buildUrlFromComponentRoute('//users///profile', undefined, mockHeaders);
      expect(result).toBe('https://example.com/users/profile');
    });

    it('should handle trailing slashes', () => {
      const result = buildUrlFromComponentRoute('/users/', undefined, mockHeaders);
      expect(result).toBe('https://example.com/users');
    });

    it('should handle root path', () => {
      const result = buildUrlFromComponentRoute('', undefined, mockHeaders);
      expect(result).toBe('https://example.com/');
    });

    it('should use pathname if provided', () => {
      const result = buildUrlFromComponentRoute('/original', undefined, mockHeaders, '/override');
      expect(result).toBe('https://example.com/override');
    });

    it('should return path only if protocol is missing', () => {
      const result = buildUrlFromComponentRoute('/test', undefined, { host: 'example.com' });
      expect(result).toBe('/test');
    });

    it('should return path only if host is missing', () => {
      const result = buildUrlFromComponentRoute('/test', undefined, { 'x-forwarded-proto': 'https' });
      expect(result).toBe('/test');
    });

    it('should handle invalid URL construction', () => {
      const result = buildUrlFromComponentRoute('/test', undefined, {
        'x-forwarded-proto': 'invalid://',
        host: 'example.com',
      });
      expect(result).toBe('/test');
    });
  });

  describe('extractSanitizedUrlFromRefererHeader', () => {
    it('should return undefined if referer is missing', () => {
      const result = extractSanitizedUrlFromRefererHeader({});
      expect(result).toBeUndefined();
    });

    it('should return undefined if referer is invalid', () => {
      const result = extractSanitizedUrlFromRefererHeader({ referer: 'invalid-url' });
      expect(result).toBeUndefined();
    });

    it('should handle referer with special characters', () => {
      const headers = { referer: 'https://example.com/path with spaces/ümlaut' };
      const result = extractSanitizedUrlFromRefererHeader(headers);
      expect(result).toBe('https://example.com/path%20with%20spaces/%C3%BCmlaut');
    });
  });

  describe('getSanitizedRequestUrl', () => {
    const mockHeaders = {
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'example.com',
      host: 'example.com',
    };

    it('should use referer URL if available and valid', () => {
      const headers = {
        ...mockHeaders,
        referer: 'https://example.com/referer-page',
      };
      const result = getSanitizedRequestUrl('/original', undefined, headers);
      expect(result).toBe('https://example.com/referer-page');
    });

    it('should fall back to building URL if referer is invalid', () => {
      const headers = {
        ...mockHeaders,
        referer: 'invalid-url',
      };
      const result = getSanitizedRequestUrl('/fallback', undefined, headers);
      expect(result).toBe('https://example.com/fallback');
    });

    it('should fall back to building URL if referer is missing', () => {
      const result = getSanitizedRequestUrl('/fallback', undefined, mockHeaders);
      expect(result).toBe('https://example.com/fallback');
    });

    it('should handle route parameters in fallback URL', () => {
      const result = getSanitizedRequestUrl('/users/[id]', { id: '123' }, mockHeaders);
      expect(result).toBe('https://example.com/users/123');
    });

    it('should handle pathname override in fallback URL', () => {
      const result = getSanitizedRequestUrl('/original', undefined, mockHeaders, '/override');
      expect(result).toBe('https://example.com/override');
    });

    it('should handle empty headers', () => {
      const result = getSanitizedRequestUrl('/test', undefined, {});
      expect(result).toBe('/test');
    });

    it('should handle undefined headers', () => {
      const result = getSanitizedRequestUrl('/test', undefined, undefined);
      expect(result).toBe('/test');
    });
  });

  describe('sanitizeRoutePath', () => {
    it('should handle root path', () => {
      const result = sanitizeRoutePath('');
      expect(result).toBe('/');
    });

    it('should handle multiple slashes', () => {
      const result = sanitizeRoutePath('////foo///bar');
      expect(result).toBe('/foo/bar');
    });

    it('should handle route groups', () => {
      const result = sanitizeRoutePath('/products/(auth)/details');
      expect(result).toBe('/products/details');
    });
  });

  describe('substituteRouteParams', () => {
    it('should handle route parameters', () => {
      const result = substituteRouteParams('/users/[id]', { id: '123' });
      expect(result).toBe('/users/123');
    });

    it('should handle multiple instances of the same parameter', () => {
      const result = substituteRouteParams('/users/[id]/[id]/profile', { id: '123' });
      expect(result).toBe('/users/123/123/profile');
    });

    it('should handle special characters in parameters', () => {
      const result = substituteRouteParams('/search/[query]', { query: 'hello world' });
      expect(result).toBe('/search/hello%20world');
    });

    it('should handle undefined parameters', () => {
      const result = substituteRouteParams('/users/[id]', undefined);
      expect(result).toBe('/users/[id]');
    });
  });
});
