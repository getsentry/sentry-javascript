import { describe, expect, it } from 'vitest';
import { _shouldInstrumentSpans, isStaticAssetRequest } from '../../src/integrations/http';
import { conditionalTest } from '../helpers/conditional';

describe('httpIntegration', () => {
  describe('_shouldInstrumentSpans', () => {
    it.each([
      [{ spans: true }, {}, true],
      [{ spans: false }, {}, false],
      [{ spans: true }, { skipOpenTelemetrySetup: true }, true],
      [{ spans: false }, { skipOpenTelemetrySetup: true }, false],
      [{}, { skipOpenTelemetrySetup: true }, false],
      [{}, { tracesSampleRate: 0, skipOpenTelemetrySetup: true }, false],
      [{}, { tracesSampleRate: 0 }, true],
    ])('returns the correct value for options=%j and clientOptions=%j', (options, clientOptions, expected) => {
      const actual = _shouldInstrumentSpans(options, clientOptions);
      expect(actual).toBe(expected);
    });

    conditionalTest({ min: 22 })('returns false without tracesSampleRate on Node >=22', () => {
      const actual = _shouldInstrumentSpans({}, {});
      expect(actual).toBe(false);
    });

    conditionalTest({ max: 21 })('returns true without tracesSampleRate on Node <22', () => {
      const actual = _shouldInstrumentSpans({}, {});
      expect(actual).toBe(true);
    });
  });

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
      ['/users', false],
      ['/graphql', false],
      ['/', false],
    ])('returns %s -> %s', (urlPath, expected) => {
      expect(isStaticAssetRequest(urlPath)).toBe(expected);
    });
  });
});
