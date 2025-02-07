/**
 * @vitest-environment jsdom
 */

/* eslint-disable @typescript-eslint/unbound-method */
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as SentryCore from '@sentry/core';
import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/core';
import type { Integration } from '@sentry/core';

import type { BrowserOptions } from '../src';
import { WINDOW } from '../src';
import { applyDefaultOptions, init, initWithDefaultIntegrations } from '../src/sdk';

const PUBLIC_DSN = 'https://username@domain/123';

function getDefaultBrowserOptions(options: Partial<BrowserOptions> = {}): BrowserOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}

export class MockIntegration implements Integration {
  public name: string;
  public setupOnce: () => void = vi.fn();
  public constructor(name: string) {
    this.name = name;
  }
}

describe('init', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('installs passed default integrations', () => {
    const DEFAULT_INTEGRATIONS: Integration[] = [
      new MockIntegration('MockIntegration 0.1'),
      new MockIntegration('MockIntegration 0.2'),
    ];
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: DEFAULT_INTEGRATIONS });

    init(options);

    expect(DEFAULT_INTEGRATIONS[0]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
    expect(DEFAULT_INTEGRATIONS[1]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
  });

  it('installs default integrations', () => {
    // Note: We need to prevent this from actually adding all the default integrations, as otherwise
    // following tests may fail (e.g. because console is monkey patched etc.)
    const spyGetIntegrationsToSetup = vi.spyOn(SentryCore, 'getIntegrationsToSetup').mockImplementation(() => []);

    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN });
    init(options);

    expect(spyGetIntegrationsToSetup).toHaveBeenCalledTimes(1);
    expect(spyGetIntegrationsToSetup).toHaveBeenCalledWith(
      expect.objectContaining(options),
      expect.arrayContaining([expect.objectContaining({ name: 'InboundFilters' })]),
    );
  });

  it('installs default integrations if `defaultIntegrations: undefined`', () => {
    // Note: We need to prevent this from actually adding all the default integrations, as otherwise
    // following tests may fail (e.g. because console is monkey patched etc.)
    const spyGetIntegrationsToSetup = vi.spyOn(SentryCore, 'getIntegrationsToSetup').mockImplementation(() => []);

    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: undefined });
    init(options);

    expect(spyGetIntegrationsToSetup).toHaveBeenCalledTimes(1);
    expect(spyGetIntegrationsToSetup).toHaveBeenCalledWith(
      expect.objectContaining(options),
      expect.arrayContaining([expect.objectContaining({ name: 'InboundFilters' })]),
    );
  });

  test("doesn't install any default integrations if told not to", () => {
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: false });
    const client = init(options);

    expect(client?.['_integrations']).toEqual({});
  });

  it('installs merged default integrations, with overrides provided through options', () => {
    const DEFAULT_INTEGRATIONS = [
      new MockIntegration('MockIntegration 1.1'),
      new MockIntegration('MockIntegration 1.2'),
    ];

    const integrations = [new MockIntegration('MockIntegration 1.1'), new MockIntegration('MockIntegration 1.3')];
    const options = getDefaultBrowserOptions({
      dsn: PUBLIC_DSN,
      defaultIntegrations: DEFAULT_INTEGRATIONS,
      integrations,
    });

    init(options);
    // 'MockIntegration 1' should be overridden by the one with the same name provided through options
    expect(DEFAULT_INTEGRATIONS[0]!.setupOnce as Mock).toHaveBeenCalledTimes(0);
    expect(DEFAULT_INTEGRATIONS[1]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
    expect(integrations[0]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
    expect(integrations[1]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
  });

  it('installs integrations returned from a callback function', () => {
    const DEFAULT_INTEGRATIONS = [
      new MockIntegration('MockIntegration 2.1'),
      new MockIntegration('MockIntegration 2.2'),
    ];

    const newIntegration = new MockIntegration('MockIntegration 2.3');
    const options = getDefaultBrowserOptions({
      defaultIntegrations: DEFAULT_INTEGRATIONS,
      dsn: PUBLIC_DSN,
      integrations: (integrations: Integration[]) => {
        const t = integrations.slice(0, 1).concat(newIntegration);
        return t;
      },
    });

    init(options);

    expect(DEFAULT_INTEGRATIONS[0]!.setupOnce as Mock).toHaveBeenCalledTimes(1);
    expect(newIntegration.setupOnce as Mock).toHaveBeenCalledTimes(1);
    expect(DEFAULT_INTEGRATIONS[1]!.setupOnce as Mock).toHaveBeenCalledTimes(0);
  });

  describe('initialization error in browser extension', () => {
    const DEFAULT_INTEGRATIONS: Integration[] = [
      new MockIntegration('MockIntegration 0.1'),
      new MockIntegration('MockIntegration 0.2'),
    ];

    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: DEFAULT_INTEGRATIONS });

    afterEach(() => {
      Object.defineProperty(WINDOW, 'chrome', { value: undefined, writable: true });
      Object.defineProperty(WINDOW, 'browser', { value: undefined, writable: true });
      Object.defineProperty(WINDOW, 'nw', { value: undefined, writable: true });
      Object.defineProperty(WINDOW, 'window', { value: WINDOW, writable: true });
      vi.restoreAllMocks();
    });

    it('logs a browser extension error if executed inside a Chrome extension', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'chrome', {
        value: { runtime: { id: 'mock-extension-id' } },
        writable: true,
      });

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
      );
    });

    it('logs a browser extension error if executed inside a Firefox/Safari extension', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'browser', { value: { runtime: { id: 'mock-extension-id' } }, writable: true });

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
      );
    });

    it.each(['chrome-extension', 'moz-extension', 'ms-browser-extension', 'safari-web-extension'])(
      "doesn't log a browser extension error if executed inside an extension running in a dedicated page (%s)",
      extensionProtocol => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const locationHrefSpy = vi
          .spyOn(SentryCore, 'getLocationHref')
          .mockImplementation(() => `${extensionProtocol}://mock-extension-id/dedicated-page.html`);

        Object.defineProperty(WINDOW, 'browser', { value: { runtime: { id: 'mock-extension-id' } }, writable: true });

        init(options);

        expect(consoleErrorSpy).toBeCalledTimes(0);

        consoleErrorSpy.mockRestore();
        locationHrefSpy.mockRestore();
      },
    );

    it("doesn't log a browser extension error if executed inside regular browser environment", () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(0);

      consoleErrorSpy.mockRestore();
    });

    it("doesn't log a browser extension error if executed inside an NW.js environment", () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'nw', { value: {} });

      init(options);

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("doesn't log a browser extension error if the `window` object isn't defined", () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'window', { value: undefined });

      init(options);

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("doesn't return a client on initialization error", () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'chrome', {
        value: { runtime: { id: 'mock-extension-id' } },
        writable: true,
      });

      const client = init(options);

      expect(client).toBeUndefined();

      consoleErrorSpy.mockRestore();
    });
  });

  it('returns a client from init', () => {
    const client = init();
    expect(client).not.toBeUndefined();
  });
});

describe('initWithDefaultIntegrations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('installs with provided getDefaultIntegrations function', () => {
    const integration1 = new MockIntegration(SentryCore.uuid4());
    const integration2 = new MockIntegration(SentryCore.uuid4());
    const getDefaultIntegrations = vi.fn(() => [integration1, integration2]);
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN });

    const client = initWithDefaultIntegrations(options, getDefaultIntegrations);

    expect(getDefaultIntegrations).toHaveBeenCalledTimes(1);
    expect(getDefaultIntegrations).toHaveBeenCalledWith(options);

    expect(client).toBeDefined();
    expect(client?.['_integrations']).toEqual({
      [integration1.name]: integration1,
      [integration2.name]: integration2,
    });
    expect(integration1.setupOnce).toHaveBeenCalledTimes(1);
    expect(integration2.setupOnce).toHaveBeenCalledTimes(1);
  });
});

describe('applyDefaultOptions', () => {
  test('it works with empty options', () => {
    const options = {};
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: undefined,
      sendClientReports: true,
    });
  });

  test('it works with options', () => {
    const options = {
      tracesSampleRate: 0.5,
      release: '1.0.0',
    };
    const actual = applyDefaultOptions(options);

    expect(actual).toEqual({
      release: '1.0.0',
      sendClientReports: true,
      tracesSampleRate: 0.5,
    });
  });

  test('it works with defaultIntegrations=false', () => {
    const options = {
      defaultIntegrations: false,
    } as const;
    const actual = applyDefaultOptions(options);

    expect(actual.defaultIntegrations).toStrictEqual(false);
  });

  test('it works with defaultIntegrations=[]', () => {
    const options = {
      defaultIntegrations: [],
    };
    const actual = applyDefaultOptions(options);

    expect(actual.defaultIntegrations).toEqual([]);
  });

  test('it works with tracesSampleRate=undefined', () => {
    const options = {
      tracesSampleRate: undefined,
    } as const;
    const actual = applyDefaultOptions(options);

    // Not defined, not even undefined
    expect(actual.tracesSampleRate).toStrictEqual(undefined);
  });

  test('it works with tracesSampleRate=null', () => {
    const options = {
      tracesSampleRate: null,
    } as any;
    const actual = applyDefaultOptions(options);

    expect(actual.tracesSampleRate).toStrictEqual(null);
  });

  test('it works with tracesSampleRate=0', () => {
    const options = {
      tracesSampleRate: 0,
    } as const;
    const actual = applyDefaultOptions(options);

    expect(actual.tracesSampleRate).toStrictEqual(0);
  });

  test('it does not deep-drop undefined keys', () => {
    const options = {
      obj: {
        prop: undefined,
      },
    } as any;
    const actual = applyDefaultOptions(options) as any;

    expect('prop' in actual.obj).toBe(true);
    expect(actual.obj.prop).toStrictEqual(undefined);
  });
});
