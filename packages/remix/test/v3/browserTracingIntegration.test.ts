import type { Client } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startBrowserTracingNavigationSpan = vi.fn();
const upstreamIntegration = { name: 'BrowserTracing', afterAllSetup: vi.fn() };
const upstreamOptions: { instrumentNavigation?: boolean }[] = [];

vi.mock('@sentry/browser', () => ({
  browserTracingIntegration: (options: { instrumentNavigation?: boolean }) => {
    upstreamOptions.push(options);
    return upstreamIntegration;
  },
  startBrowserTracingNavigationSpan: (...args: unknown[]) => startBrowserTracingNavigationSpan(...args),
  WINDOW: globalThis,
}));

const { browserTracingIntegration } = await import('../../src/v3/client/browserTracingIntegration');

interface FakeNavigateEvent {
  canIntercept: boolean;
  info?: unknown;
  destination?: { url: string };
}

const client = { getOptions: () => ({ traceLifecycle: 'stream' }) } as unknown as Client;

/** Sets up the integration over a fake Navigation API and returns a way to fire `navigate` events. */
function setup(options = {}): (event: FakeNavigateEvent) => void {
  let listener: ((event: FakeNavigateEvent) => void) | undefined;

  Object.assign(globalThis, {
    location: { origin: 'https://app.test', pathname: '/' },
    navigation: {
      addEventListener: (_type: string, fn: (event: FakeNavigateEvent) => void) => {
        listener = fn;
      },
    },
  });

  browserTracingIntegration(options).afterAllSetup?.(client);

  return event => listener?.(event);
}

describe('browserTracingIntegration', () => {
  beforeEach(() => {
    startBrowserTracingNavigationSpan.mockClear();
    upstreamOptions.length = 0;
  });

  it('leaves page loads to the upstream integration and takes over navigation', () => {
    setup();

    expect(upstreamOptions[0]).toEqual({ instrumentNavigation: false });
  });

  it('starts a navigation span for an intercepted navigation', () => {
    const navigate = setup();

    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/12345' } });

    expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      client,
      {
        // Low cardinality, because the browser has no route patterns.
        name: 'Navigation',
        attributes: {
          'sentry.segment.name.source': 'url',
          'sentry.origin': 'auto.navigation.remix_v3',
        },
      },
      { url: 'https://app.test/users/12345' },
    );
  });

  // Each of these becomes a new document load, which the upstream integration reports as a page load,
  // so a navigation span would count the same action twice.
  it.each([
    ['the runtime cannot intercept it', { canIntercept: false, destination: { url: 'https://app.test/x' } }],
    [
      "it is the runtime's own document reload",
      { canIntercept: true, info: 'remix-document-reload', destination: { url: 'https://app.test/x' } },
    ],
    ['it leaves the origin', { canIntercept: true, destination: { url: 'https://elsewhere.test/x' } }],
    ['there is no destination', { canIntercept: true }],
  ])('starts no navigation span when %s', (_why, event) => {
    const navigate = setup();

    navigate(event as FakeNavigateEvent);

    expect(startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });

  it('names the span after the path when span streaming is off', () => {
    const staticClient = { getOptions: () => ({ traceLifecycle: 'static' }) } as unknown as Client;
    let listener: ((event: FakeNavigateEvent) => void) | undefined;
    Object.assign(globalThis, {
      location: { origin: 'https://app.test', pathname: '/' },
      navigation: { addEventListener: (_t: string, fn: typeof listener) => void (listener = fn) },
    });
    browserTracingIntegration().afterAllSetup?.(staticClient);

    listener?.({ canIntercept: true, destination: { url: 'https://app.test/users/12345?q=1' } });

    expect(startBrowserTracingNavigationSpan).toHaveBeenCalledWith(
      staticClient,
      expect.objectContaining({ name: '/users/12345' }),
      { url: 'https://app.test/users/12345?q=1' },
    );
  });

  it('starts no navigation span when instrumentNavigation is off', () => {
    const navigate = setup({ instrumentNavigation: false });

    navigate({ canIntercept: true, destination: { url: 'https://app.test/users/1' } });

    expect(startBrowserTracingNavigationSpan).not.toHaveBeenCalled();
  });
});
