import { describe, expect, it } from 'vitest';
import { isStaticAssetRequest } from '../../src/integrations/http/httpServerSpansIntegration';

describe('httpIntegration', () => {
  describe('isStaticAssetRequest', () => {
    it.each([
      ['/favicon.ico', true],
      ['/apple-touch-icon.png', true],
      ['/static/style.css', true],
      ['/assets/app.js', true],
      ['/fonts/font.woff2', true],
      ['/images/logo.svg', true],
      ['/img/photo.jpeg', true],
      ['/img/photo.jpg', true],
      ['/img/photo.jpg?v=123', true],
      ['/img/photo.webp', true],
      ['/font/font.ttf', true],
      ['/robots.txt', true],
      ['/sitemap.xml', true],
      ['/manifest.json', true],
      ['/browserconfig.xml', true],
      // non-static routes
      ['/api/users', false],
      ['/some-json.json', false],
      ['/some-xml.xml', false],
      ['/some-txt.txt', false],
      ['/users', false],
      ['/graphql', false],
      ['/', false],
    ])('returns %s -> %s', (urlPath, expected) => {
      expect(isStaticAssetRequest(urlPath)).toBe(expected);
    });
  });
});
