/**
 * @vitest-environment jsdom
 */

import * as sentryCore from '@sentry/core';
import { Scope } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDefaultOptions, BrowserClient } from '../src/client';
import { WINDOW } from '../src/helpers';
import { getDefaultBrowserClientOptions } from './helper/browser-client-options';

vi.mock('@sentry/core', async requireActual => {
  return {
    ...((await requireActual()) as any),
    _INTERNAL_flushLogsBuffer: vi.fn(),
  };
});

describe('BrowserClient', () => {
  let client: BrowserClient;

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not flush logs when logs are disabled', () => {
    client = new BrowserClient(
      getDefaultBrowserClientOptions({
        sendClientReports: true,
      }),
    );
    const scope = new Scope();
    scope.setClient(client);

    // Add some logs
    sentryCore._INTERNAL_captureLog({ level: 'info', message: 'test log 1' }, scope);
    sentryCore._INTERNAL_captureLog({ level: 'info', message: 'test log 2' }, scope);

    // Simulate visibility change to hidden
    if (WINDOW.document) {
      Object.defineProperty(WINDOW.document, 'visibilityState', { value: 'hidden' });
      WINDOW.document.dispatchEvent(new Event('visibilitychange'));
    }

    expect(sentryCore._INTERNAL_flushLogsBuffer).not.toHaveBeenCalled();
  });

  describe('log flushing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      client = new BrowserClient(
        getDefaultBrowserClientOptions({
          enableLogs: true,
          sendClientReports: true,
        }),
      );
    });

    it('flushes logs when page visibility changes to hidden', () => {
      const flushOutcomesSpy = vi.spyOn(client as any, '_flushOutcomes');

      const scope = new Scope();
      scope.setClient(client);

      // Add some logs
      sentryCore._INTERNAL_captureLog({ level: 'info', message: 'test log 1' }, scope);
      sentryCore._INTERNAL_captureLog({ level: 'info', message: 'test log 2' }, scope);

      // Simulate visibility change to hidden
      if (WINDOW.document) {
        Object.defineProperty(WINDOW.document, 'visibilityState', { value: 'hidden' });
        WINDOW.document.dispatchEvent(new Event('visibilitychange'));
      }

      expect(flushOutcomesSpy).toHaveBeenCalled();
      expect(sentryCore._INTERNAL_flushLogsBuffer).toHaveBeenCalledWith(client);
    });
  });
});

describe('applyDefaultOptions', () => {
  it('works with empty options', () => {
    const options = {};
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: undefined,
      sendClientReports: true,
      parentSpanIsAlwaysRootSpan: true,
    });
  });

  it('works with options', () => {
    const options = {
      tracesSampleRate: 0.5,
      release: '1.0.0',
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '1.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });
  });

  it('picks up release from WINDOW.SENTRY_RELEASE.id', () => {
    const releaseBefore = WINDOW.SENTRY_RELEASE;

    WINDOW.SENTRY_RELEASE = { id: '1.0.0' };
    const options = {
      tracesSampleRate: 0.5,
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '1.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });

    WINDOW.SENTRY_RELEASE = releaseBefore;
  });

  it('passed in release takes precedence over WINDOW.SENTRY_RELEASE.id', () => {
    const releaseBefore = WINDOW.SENTRY_RELEASE;

    WINDOW.SENTRY_RELEASE = { id: '1.0.0' };
    const options = {
      release: '2.0.0',
      tracesSampleRate: 0.5,
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '2.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
      parentSpanIsAlwaysRootSpan: true,
    });

    WINDOW.SENTRY_RELEASE = releaseBefore;
  });
});

describe('SDK metadata', () => {
  describe('sdk.settings', () => {
    it('sets infer_ip to "never" by default', () => {
      const options = getDefaultBrowserClientOptions({});
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings?.infer_ip).toBe('never');
    });

    it('sets infer_ip to "never" if sendDefaultPii is false', () => {
      const options = getDefaultBrowserClientOptions({
        sendDefaultPii: false,
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings?.infer_ip).toBe('never');
    });

    it('sets infer_ip to "auto" if sendDefaultPii is true', () => {
      const options = getDefaultBrowserClientOptions({
        sendDefaultPii: true,
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings?.infer_ip).toBe('auto');
    });

    it("doesn't override already set sdk metadata settings", () => {
      const options = getDefaultBrowserClientOptions({
        sendDefaultPii: true,
        _metadata: {
          sdk: {
            settings: {
              infer_ip: 'never',
              // @ts-expect-error -- not typed but let's test anyway
              other_random_setting: 'some value',
            },
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.settings).toEqual({
        infer_ip: 'never',
        other_random_setting: 'some value',
      });
    });

    it('still sets infer_ip if other SDK metadata was already passed in', () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk).toEqual({
        name: 'sentry.javascript.angular',
        settings: {
          infer_ip: 'never',
        },
      });
    });
  });

  describe('sdk data', () => {
    it('sets sdk.name to "sentry.javascript.browser" by default', () => {
      const options = getDefaultBrowserClientOptions({});
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.browser');
    });

    it("doesn't override already set sdk metadata", () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.angular',
          },
        },
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk?.name).toBe('sentry.javascript.angular');
    });

    it('preserves passed-in partial SDK metadata', () => {
      const options = getDefaultBrowserClientOptions({
        _metadata: {
          sdk: {
            settings: {
              infer_ip: 'auto',
            },
          },
        },
        // Usually, this would cause infer_ip to be set to 'never'
        // but we're passing it in explicitly, so it should be preserved
        sendDefaultPii: false,
      });
      const client = new BrowserClient(options);

      expect(client.getOptions()._metadata?.sdk).toEqual({
        name: 'sentry.javascript.browser',
        version: expect.any(String),
        packages: [{ name: 'npm:@sentry/browser', version: expect.any(String) }],
        settings: {
          infer_ip: 'auto',
        },
      });
    });
  });
});
