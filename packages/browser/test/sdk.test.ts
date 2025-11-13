/**
 * @vitest-environment jsdom
 */

/* eslint-disable @typescript-eslint/unbound-method */
import type { Integration } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { createTransport, resolvedSyncPromise } from '@sentry/core';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import type { BrowserOptions } from '../src';
import { WINDOW } from '../src';
import { init } from '../src/sdk';

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

  it('installs default integrations if `defaultIntegrations: undefined`', () => {
    // @ts-expect-error this is fine for testing
    const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: undefined });
    init(options);

    expect(initAndBindSpy).toHaveBeenCalledTimes(1);

    const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
    expect(optionsPassed?.integrations.length).toBeGreaterThan(0);
  });

  test("doesn't install default integrations if told not to", () => {
    const DEFAULT_INTEGRATIONS: Integration[] = [
      new MockIntegration('MockIntegration 0.3'),
      new MockIntegration('MockIntegration 0.4'),
    ];
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: false });
    init(options);

    expect(DEFAULT_INTEGRATIONS[0]!.setupOnce as Mock).toHaveBeenCalledTimes(0);
    expect(DEFAULT_INTEGRATIONS[1]!.setupOnce as Mock).toHaveBeenCalledTimes(0);
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
        '[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
      );
    });

    it('logs a browser extension error if executed inside a Firefox/Safari extension', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'browser', { value: { runtime: { id: 'mock-extension-id' } }, writable: true });

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
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

    it('returns a disabled client on initialization error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'chrome', {
        value: { runtime: { id: 'mock-extension-id' } },
        writable: true,
      });

      const client = init(options);

      expect(client).toBeDefined();
      expect(SentryCore.isEnabled()).toBe(false);
      expect(client!['_isEnabled']()).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Spotlight environment variable support', () => {
    let originalProcess: typeof globalThis.process | undefined;

    afterEach(() => {
      if (originalProcess !== undefined) {
        globalThis.process = originalProcess;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).process;
      }
    });

    it('uses environment variable when options.spotlight is undefined', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'true',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: undefined });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should be added
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeDefined();
    });

    it('does not add Spotlight when environment variable is false', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: undefined });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should NOT be added
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeUndefined();
    });

    it('options.spotlight=false takes precedence over environment variable', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'true',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: false });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should NOT be added even though env var is true
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeUndefined();
    });

    it('options.spotlight=url takes precedence over environment variable', () => {
      originalProcess = globalThis.process;
      const customUrl = 'http://custom:1234/stream';
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'http://env:5678/stream',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: customUrl });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should be added (we can't easily check the URL here without deeper inspection)
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeDefined();
    });

    it('uses environment variable URL when options.spotlight=true', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'http://env:5678/stream',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: true });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should be added
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeDefined();
    });

    it('respects priority order: SENTRY_SPOTLIGHT over PUBLIC_SENTRY_SPOTLIGHT', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          SENTRY_SPOTLIGHT: 'true',
          PUBLIC_SENTRY_SPOTLIGHT: 'false',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: undefined });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should be added (SENTRY_SPOTLIGHT=true wins)
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeDefined();
    });

    it('uses framework-specific prefix when base is not set', () => {
      originalProcess = globalThis.process;
      globalThis.process = {
        env: {
          NEXT_PUBLIC_SENTRY_SPOTLIGHT: 'true',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // @ts-expect-error this is fine for testing
      const initAndBindSpy = vi.spyOn(SentryCore, 'initAndBind').mockImplementationOnce(() => {});
      const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, spotlight: undefined });
      init(options);

      const optionsPassed = initAndBindSpy.mock.calls[0]?.[1];
      // Spotlight integration should be added
      const spotlightIntegration = optionsPassed?.integrations.find((i: Integration) => i.name === 'SpotlightBrowser');
      expect(spotlightIntegration).toBeDefined();
    });
  });

  it('returns a client from init', () => {
    const client = init();
    expect(client).not.toBeUndefined();
  });
});
