/* eslint-disable @typescript-eslint/unbound-method */
import { Scope, createTransport } from '@sentry/core';
import type { Client, Integration } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

import type { BrowserOptions } from '../../src';
import { WINDOW } from '../../src';
import { init } from '../../src/sdk';

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
  public setupOnce: () => void = jest.fn();
  public constructor(name: string) {
    this.name = name;
  }
}

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub(): {
      bindClient(client: Client): boolean;
      getClient(): boolean;
      getScope(): Scope;
    } {
      return {
        getClient(): boolean {
          return false;
        },
        getScope(): Scope {
          return new Scope();
        },
        bindClient(client: Client): boolean {
          client.init!();
          return true;
        },
      };
    },
  };
});

describe('init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.resetAllMocks();
  });

  test('installs default integrations', () => {
    const DEFAULT_INTEGRATIONS: Integration[] = [
      new MockIntegration('MockIntegration 0.1'),
      new MockIntegration('MockIntegration 0.2'),
    ];
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: DEFAULT_INTEGRATIONS });

    init(options);

    expect(DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
  });

  test("doesn't install default integrations if told not to", () => {
    const DEFAULT_INTEGRATIONS: Integration[] = [
      new MockIntegration('MockIntegration 0.3'),
      new MockIntegration('MockIntegration 0.4'),
    ];
    const options = getDefaultBrowserOptions({ dsn: PUBLIC_DSN, defaultIntegrations: false });
    init(options);

    expect(DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
    expect(DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
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
    expect(DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
    expect(DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(integrations[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(integrations[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
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

    expect(DEFAULT_INTEGRATIONS[0].setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(newIntegration.setupOnce as jest.Mock).toHaveBeenCalledTimes(1);
    expect(DEFAULT_INTEGRATIONS[1].setupOnce as jest.Mock).toHaveBeenCalledTimes(0);
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
    });

    it('should log a browser extension error if executed inside a Chrome extension', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'chrome', {
        value: { runtime: { id: 'mock-extension-id' } },
        writable: true,
      });

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/troubleshooting/#setting-up-sentry-in-shared-environments-eg-browser-extensions',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log a browser extension error if executed inside a Firefox/Safari extension', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      Object.defineProperty(WINDOW, 'browser', { value: { runtime: { id: 'mock-extension-id' } }, writable: true });

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Sentry] You cannot run Sentry this way in a browser extension, check: https://docs.sentry.io/platforms/javascript/troubleshooting/#setting-up-sentry-in-shared-environments-eg-browser-extensions',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not log a browser extension error if executed inside regular browser environment', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      init(options);

      expect(consoleErrorSpy).toBeCalledTimes(0);

      consoleErrorSpy.mockRestore();
    });
  });
});
