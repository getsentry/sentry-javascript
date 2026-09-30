import type * as SentryBrowser from '@sentry/browser';
import type { BrowserOptions } from '@sentry/browser';
import { describe, expect, it, vi } from 'vitest';

const browserInit = vi.fn();

// Only `init` is replaced. Everything else stays real, so the integration assertion below is checked
// against the actual `@sentry/browser` defaults.
vi.mock('@sentry/browser', async importOriginal => ({
  ...(await importOriginal<typeof SentryBrowser>()),
  init: (options: BrowserOptions) => browserInit(options),
}));

const { getDefaultIntegrations, init } = await import('../../src/v3/client/sdk');

describe('getDefaultIntegrations', () => {
  // `@sentry/browser`'s own defaults do not include browser tracing today, so this list adds it. If
  // that ever changes upstream, a Remix 3 app would quietly end up with two browser tracing
  // integrations, one of which reports no navigations at all.
  it('adds exactly one browser tracing integration', () => {
    const integrations = getDefaultIntegrations({});

    expect(integrations.filter(integration => integration.name === 'BrowserTracing')).toHaveLength(1);
  });
});

describe('init', () => {
  // The Remix 3 code ships inside `@sentry/remix`, so that is the package events have to name. Any
  // other name is not installable from npm.
  it('reports installable package names', () => {
    init({});

    expect(browserInit).toHaveBeenCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.remix',
            version: expect.any(String),
            packages: [
              { name: 'npm:@sentry/remix', version: expect.any(String) },
              { name: 'npm:@sentry/browser', version: expect.any(String) },
            ],
          },
        },
      }),
    );
  });
});

describe('the client entry', () => {
  // For the span start APIs the two packages export different implementations, and only
  // `@sentry/browser`'s installs span streaming on first use. Taking one from `@sentry/core` is
  // invisible until an app replaces the default integrations, because browser tracing installs span
  // streaming anyway.
  it('re-exports @sentry/browser, never a @sentry/core lookalike', async () => {
    const [entry, browser] = await Promise.all([
      import('../../src/v3/index.client'),
      vi.importActual<typeof SentryBrowser>('@sentry/browser'),
    ]);

    // The three the Remix 3 SDK deliberately replaces.
    const overridden = ['init', 'getDefaultIntegrations', 'browserTracingIntegration'];
    const shared = Object.keys(entry).filter(name => name in browser && !overridden.includes(name));
    const wrongSource = shared.filter(
      name => entry[name as keyof typeof entry] !== browser[name as keyof typeof browser],
    );

    expect(shared.length).toBeGreaterThan(20);
    expect(wrongSource).toEqual([]);
  });
});
