import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cultureContextIntegration } from '../../src/integrations/culturecontext';

describe('CultureContext', () => {
  const originalIntl = globalThis.Intl;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.Intl = originalIntl;
  });

  describe('preprocessEvent', () => {
    it('adds culture context with locale and timezone', () => {
      const mockResolvedOptions = vi.fn().mockReturnValue({
        locale: 'en-US',
        timeZone: 'America/New_York',
      });

      globalThis.Intl = {
        DateTimeFormat: vi.fn().mockReturnValue({
          resolvedOptions: mockResolvedOptions,
        }),
      } as unknown as typeof Intl;

      // @ts-expect-error - mockReturnValue is not typed
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: globalThis.Intl,
      } as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {};

      integration.preprocessEvent!(event, {}, {} as never);

      expect(event.contexts?.culture).toEqual({
        locale: 'en-US',
        timezone: 'America/New_York',
      });
    });

    it('preserves existing culture context values', () => {
      const mockResolvedOptions = vi.fn().mockReturnValue({
        locale: 'en-US',
        timeZone: 'America/New_York',
      });

      globalThis.Intl = {
        DateTimeFormat: vi.fn().mockReturnValue({
          resolvedOptions: mockResolvedOptions,
        }),
      } as unknown as typeof Intl;

      // @ts-expect-error - mockReturnValue is not typed
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: globalThis.Intl,
      } as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {
        contexts: {
          culture: {
            calendar: 'gregorian',
            display_name: 'English (United States)',
          },
        },
      };

      integration.preprocessEvent!(event, {}, {} as never);

      expect(event.contexts?.culture).toEqual({
        locale: 'en-US',
        timezone: 'America/New_York',
        calendar: 'gregorian',
        display_name: 'English (United States)',
      });
    });

    it('does not override existing locale and timezone', () => {
      const mockResolvedOptions = vi.fn().mockReturnValue({
        locale: 'en-US',
        timeZone: 'America/New_York',
      });

      globalThis.Intl = {
        DateTimeFormat: vi.fn().mockReturnValue({
          resolvedOptions: mockResolvedOptions,
        }),
      } as unknown as typeof Intl;

      // @ts-expect-error - mockReturnValue is not typed
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: globalThis.Intl,
      } as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {
        contexts: {
          culture: {
            locale: 'de-DE',
            timezone: 'Europe/Berlin',
          },
        },
      };

      integration.preprocessEvent!(event, {}, {} as never);

      // Existing values should be preserved (not overwritten)
      expect(event.contexts?.culture).toEqual({
        locale: 'de-DE',
        timezone: 'Europe/Berlin',
      });
    });

    it('does not add culture context when Intl is not available', () => {
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: undefined,
      } as unknown as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {};

      integration.preprocessEvent!(event, {}, {} as never);

      expect(event.contexts?.culture).toBeUndefined();
    });

    it('handles errors gracefully when Intl.DateTimeFormat throws', () => {
      globalThis.Intl = {
        DateTimeFormat: vi.fn().mockImplementation(() => {
          throw new Error('Intl error');
        }),
      } as unknown as typeof Intl;

      // @ts-expect-error - mockReturnValue is not typed
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: globalThis.Intl,
      } as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {};

      // Should not throw
      expect(() => {
        integration.preprocessEvent!(event, {}, {} as never);
      }).not.toThrow();

      expect(event.contexts?.culture).toBeUndefined();
    });

    it('preserves other contexts when adding culture context', () => {
      const mockResolvedOptions = vi.fn().mockReturnValue({
        locale: 'fr-FR',
        timeZone: 'Europe/Paris',
      });

      globalThis.Intl = {
        DateTimeFormat: vi.fn().mockReturnValue({
          resolvedOptions: mockResolvedOptions,
        }),
      } as unknown as typeof Intl;

      // @ts-expect-error - mockReturnValue is not typed
      vi.spyOn(SentryCore, 'GLOBAL_OBJ', 'get').mockReturnValue({
        Intl: globalThis.Intl,
      } as typeof SentryCore.GLOBAL_OBJ);

      const integration = cultureContextIntegration();
      const event: Event = {
        contexts: {
          browser: {
            name: 'Chrome',
            version: '100.0',
          },
        },
      };

      integration.preprocessEvent!(event, {}, {} as never);

      expect(event.contexts?.browser).toEqual({
        name: 'Chrome',
        version: '100.0',
      });
      expect(event.contexts?.culture).toEqual({
        locale: 'fr-FR',
        timezone: 'Europe/Paris',
      });
    });
  });
});
