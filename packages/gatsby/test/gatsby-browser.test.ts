/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

const { onClientEntry } = require('../gatsby-browser');

(global as any).__SENTRY_RELEASE__ = '683f3a6ab819d47d23abfca9a914c81f0524d35b';
(global as any).__SENTRY_DSN__ = 'https://examplePublicKey@o0.ingest.sentry.io/0';

let sentryInit = jest.fn();
jest.mock('@sentry/react', () => {
  const original = jest.requireActual('@sentry/react');
  return {
    ...original,
    init: (...args: any[]) => {
      sentryInit(...args);
    },
  };
});

let tracingAddExtensionMethods = jest.fn();
jest.mock('@sentry/tracing', () => {
  const original = jest.requireActual('@sentry/tracing');
  return {
    ...original,
    addExtensionMethods: (...args: any[]) => {
      tracingAddExtensionMethods(...args);
    },
  };
});

describe('onClientEntry', () => {
  beforeEach(() => {
    sentryInit = jest.fn();
    tracingAddExtensionMethods = jest.fn();
  });

  afterEach(() => {
    (window as any).Sentry = undefined;
  });

  it('inits Sentry by default', () => {
    onClientEntry(undefined, {});
    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(sentryInit).toHaveBeenLastCalledWith({
      dsn: (global as any).__SENTRY_DSN__,
      environment: process.env.NODE_ENV,
      integrations: [],
      release: (global as any).__SENTRY_RELEASE__,
      autoSessionTracking: true,
      _metadata: {
        sdk: {
          name: 'sentry.javascript.gatsby',
          packages: [
            {
              name: 'npm:@sentry/gatsby',
              version: expect.any(String),
            },
          ],
          version: expect.any(String),
        },
      },
    });
  });

  it('sets window.Sentry', () => {
    onClientEntry(undefined, {});
    expect((window as any).Sentry).not.toBeUndefined();
  });

  it('adds Tracing extension methods', () => {
    onClientEntry(undefined, {});

    expect(tracingAddExtensionMethods).toHaveBeenCalledTimes(1);
    expect(tracingAddExtensionMethods).toHaveBeenLastCalledWith();
  });

  it('sets a tracesSampleRate if defined as option', () => {
    onClientEntry(undefined, { tracesSampleRate: 0.5 });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tracesSampleRate: 0.5,
      }),
    );
  });

  it('sets a tracesSampler if defined as option', () => {
    const tracesSampler = jest.fn();
    onClientEntry(undefined, { tracesSampler });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tracesSampler,
      }),
    );
  });

  it('adds `BrowserTracing` integration if tracesSampleRate is defined', () => {
    onClientEntry(undefined, { tracesSampleRate: 0.5 });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        integrations: [expect.objectContaining({ name: 'BrowserTracing' })],
      }),
    );
  });

  it('adds `BrowserTracing` integration if tracesSampler is defined', () => {
    const tracesSampler = jest.fn();
    onClientEntry(undefined, { tracesSampler });
    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        integrations: [expect.objectContaining({ name: 'BrowserTracing' })],
      }),
    );
  });

  it('only defines a single `BrowserTracing` integration', () => {
    const Tracing = jest.requireActual('@sentry/tracing');
    const integrations = [new Tracing.Integrations.BrowserTracing()];
    onClientEntry(undefined, { tracesSampleRate: 0.5, integrations });

    expect(sentryInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        integrations: [expect.objectContaining({ name: 'BrowserTracing' })],
      }),
    );
  });

  // Run this last to check for any test side effects
  it('does not run if plugin params are undefined', () => {
    onClientEntry();
    expect(sentryInit).toHaveBeenCalledTimes(0);
    expect((window as any).Sentry).toBeUndefined();
    expect(tracingAddExtensionMethods).toHaveBeenCalledTimes(0);
  });
});
