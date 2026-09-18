import { debug, GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flueIntegration } from '../../src/integrations/flue';

function setProvidedFlue(instrument: unknown): void {
  const marker = (GLOBAL_OBJ.__SENTRY_ORCHESTRION__ ??= {} as NonNullable<typeof GLOBAL_OBJ.__SENTRY_ORCHESTRION__>);
  (marker as { providedModules?: Record<string, unknown> }).providedModules = {
    '@flue/runtime': { instrument },
  };
}

function clearMarker(): void {
  delete (GLOBAL_OBJ as { __SENTRY_ORCHESTRION__?: unknown }).__SENTRY_ORCHESTRION__;
}

/** Flue's own error for a duplicate `instrument()`, which sets `name` on the instance. */
function alreadyInstalledError(): Error {
  const error = new Error('An instrumentation is already installed for this key');
  error.name = 'InstrumentationAlreadyInstalledError';
  return error;
}

describe('flueIntegration', () => {
  afterEach(() => {
    clearMarker();
    vi.restoreAllMocks();
  });

  it('registers the instrumentation when a Flue binding is provided', () => {
    const instrument = vi.fn();
    setProvidedFlue(instrument);

    flueIntegration().setup?.({} as never);

    expect(instrument).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no Flue binding is on the marker', () => {
    clearMarker();

    expect(() => flueIntegration().setup?.({} as never)).not.toThrow();
  });

  it('swallows a duplicate registration from an app that also calls instrument()', () => {
    setProvidedFlue(
      vi.fn(() => {
        throw alreadyInstalledError();
      }),
    );

    expect(() => flueIntegration().setup?.({} as never)).not.toThrow();
  });

  it('warns but never throws when registration fails for any other reason', () => {
    // `setup()` runs inside `Sentry.init()`, which core calls unguarded — throwing would take
    // down the Cloudflare request handler.
    const warn = vi.spyOn(debug, 'warn').mockImplementation(() => undefined);
    const error = new TypeError('instrument is not a function');
    setProvidedFlue(
      vi.fn(() => {
        throw error;
      }),
    );

    expect(() => flueIntegration().setup?.({} as never)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Flue] auto-registration failed'), error);
  });
});
