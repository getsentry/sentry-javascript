import type { CfProperties } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import {
  type CfEventType,
  getCfProperties,
  getCloudflareProperties,
  isEventType,
} from '../../../src/runtime/utils/event-type-check';

describe('event-type-check', () => {
  const mockCfProperties: CfProperties = {
    colo: 'IMLND',
    country: 'IL',
    region: 'CoreRegion',
    timezone: 'ImagineLand/Core',
    city: 'Core',
  } as CfProperties;

  const mockCloudflareProperties = {
    context: {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
      props: { key: 'value' },
    },
    request: { url: 'https://example.com' },
    env: { API_KEY: 'test' },
  };

  const createUnnestedCfEvent = (): CfEventType => ({
    protocol: 'https',
    host: 'example.com',
    method: 'GET',
    headers: { 'user-agent': 'test' },
    context: {
      cf: mockCfProperties,
      cloudflare: mockCloudflareProperties,
    },
  });

  const createPlatformCfEvent = (): CfEventType => ({
    protocol: 'https',
    host: 'example.com',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    context: {
      _platform: {
        cf: mockCfProperties,
        cloudflare: mockCloudflareProperties,
      },
    },
  });

  describe('isEventType', () => {
    describe('should return true for valid Cloudflare events', () => {
      it.each([
        ['direct cf event', createUnnestedCfEvent()],
        ['platform cf event', createPlatformCfEvent()],
      ])('%s', (_, event) => {
        expect(isEventType(event)).toBe(true);
      });
    });

    describe('should return false for invalid inputs', () => {
      it.each([
        ['null', null],
        ['undefined', undefined],
        ['string', 'invalid'],
        ['number', 123],
        ['boolean', true],
        ['array', []],
        ['empty object', {}],
      ])('%s', (_, input) => {
        expect(isEventType(input)).toBe(false);
      });
    });

    describe('should return false for objects missing required properties', () => {
      const baseEvent = createUnnestedCfEvent();

      it.each([
        ['missing protocol', { ...baseEvent, protocol: undefined }],
        ['missing host', { ...baseEvent, host: undefined }],
        ['missing context', { ...baseEvent, context: undefined }],
        ['null context', { ...baseEvent, context: null }],
        ['context without cf', { ...baseEvent, context: { cloudflare: mockCloudflareProperties } }],
        ['context without cloudflare', { ...baseEvent, context: { cf: mockCfProperties } }],
        ['context with null cf', { ...baseEvent, context: { cf: null, cloudflare: mockCloudflareProperties } }],
        ['context with null cloudflare', { ...baseEvent, context: { cf: mockCfProperties, cloudflare: null } }],
        [
          'cloudflare without context property',
          {
            ...baseEvent,
            context: {
              cf: mockCfProperties,
              cloudflare: { request: {}, env: {} },
            },
          },
        ],
      ])('%s', (_, invalidEvent) => {
        expect(isEventType(invalidEvent)).toBe(false);
      });
    });

    describe('should return false for platform events missing required properties', () => {
      const basePlatformEvent = createPlatformCfEvent();

      it.each([
        [
          'platform without cf',
          {
            ...basePlatformEvent,
            context: {
              _platform: {
                cloudflare: mockCloudflareProperties,
              },
            },
          },
        ],
        [
          'platform without cloudflare',
          {
            ...basePlatformEvent,
            context: {
              _platform: {
                cf: mockCfProperties,
              },
            },
          },
        ],
        [
          'platform with null cf',
          {
            ...basePlatformEvent,
            context: {
              _platform: {
                cf: null,
                cloudflare: mockCloudflareProperties,
              },
            },
          },
        ],
      ])('%s', (_, invalidEvent) => {
        expect(isEventType(invalidEvent)).toBe(false);
      });
    });
  });

  describe('getCfProperties', () => {
    it.each([
      ['direct cf event', createUnnestedCfEvent()],
      ['platform cf event', createPlatformCfEvent()],
    ])('should extract cf properties from %s', (_, event) => {
      const result = getCfProperties(event);
      expect(result).toEqual(mockCfProperties);
      expect(result.colo).toBe('IMLND');
      expect(result.country).toBe('IL');
    });

    it('should return the same cf properties for both event types', () => {
      const directEvent = createUnnestedCfEvent();
      const platformEvent = createPlatformCfEvent();

      const directCf = getCfProperties(directEvent);
      const platformCf = getCfProperties(platformEvent);

      expect(directCf).toEqual(platformCf);
    });
  });

  describe('getCloudflareProperties', () => {
    it.each([
      ['direct cf event', createUnnestedCfEvent()],
      ['platform cf event', createPlatformCfEvent()],
    ])('should extract cloudflare properties from %s', (_, event) => {
      const result = getCloudflareProperties(event);
      expect(result).toEqual(mockCloudflareProperties);
      expect(result.context).toBeDefined();
      expect(result.request).toEqual({ url: 'https://example.com' });
      expect(result.env).toEqual({ API_KEY: 'test' });
    });

    it('should return the same cloudflare properties for both event types', () => {
      const directEvent = createUnnestedCfEvent();
      const platformEvent = createPlatformCfEvent();

      const directCloudflare = getCloudflareProperties(directEvent);
      const platformCloudflare = getCloudflareProperties(platformEvent);

      expect(directCloudflare).toEqual(platformCloudflare);
    });
  });

  describe('integration tests', () => {
    it('should work together for a complete workflow', () => {
      const event = createUnnestedCfEvent();

      expect(isEventType(event)).toBe(true);

      const cf = getCfProperties(event);
      const cloudflare = getCloudflareProperties(event);

      expect(cf.country).toBe('IL');
      expect(cloudflare.request?.url).toBe('https://example.com');
    });

    it('should handle both event structures consistently', () => {
      const events = [createUnnestedCfEvent(), createPlatformCfEvent()];

      events.forEach(event => {
        expect(isEventType(event)).toBe(true);
        expect(getCfProperties(event)).toEqual(mockCfProperties);
        expect(getCloudflareProperties(event)).toEqual(mockCloudflareProperties);
      });
    });
  });
});
