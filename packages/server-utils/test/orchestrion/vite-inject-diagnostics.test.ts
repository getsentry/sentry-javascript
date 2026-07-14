import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the options the upstream code transformer is constructed with, so we
// can assert the `injectDiagnostics` wiring without depending on its internals.
const captured = vi.hoisted(() => ({ options: undefined as { injectDiagnostics?: unknown } | undefined }));

vi.mock('@apm-js-collab/code-transformer-bundler-plugins/vite', () => ({
  default: (options: { injectDiagnostics?: unknown }) => {
    captured.options = options;
    return [];
  },
}));

// eslint-disable-next-line import/first
import { sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/vite';

describe('sentryOrchestrionPlugin — injectDiagnostics', () => {
  beforeEach(() => {
    captured.options = undefined;
    delete globalThis.__SENTRY_ORCHESTRION__;
  });

  it('does not pass injectDiagnostics by default', () => {
    sentryOrchestrionPlugin();
    expect(captured.options?.injectDiagnostics).toBeUndefined();
  });

  it('does not pass injectDiagnostics when registerIntegrations is false', () => {
    sentryOrchestrionPlugin({ registerIntegrations: false });
    expect(captured.options?.injectDiagnostics).toBeUndefined();
  });

  it('passes injectDiagnostics when registerIntegrations is true', () => {
    sentryOrchestrionPlugin({ registerIntegrations: true });
    expect(typeof captured.options?.injectDiagnostics).toBe('function');
  });

  it('emits a self-contained banner that records the transformed modules on the marker', () => {
    sentryOrchestrionPlugin({ registerIntegrations: true });
    const injectDiagnostics = captured.options?.injectDiagnostics as (d: {
      transformedModules: string[];
      failedModules: string[];
    }) => string;

    const banner = injectDiagnostics({ transformedModules: ['pg', 'openai'], failedModules: [] });

    // No import — the banner runs at renderChunk, where a bundled import can't
    // exist; it must only touch the global marker.
    expect(banner).not.toContain('import');
    expect(banner).toContain('globalThis.__SENTRY_ORCHESTRION__');

    // Evaluating it populates the marker with exactly the transformed modules.
    // eslint-disable-next-line no-eval
    (0, eval)(banner);
    expect(globalThis.__SENTRY_ORCHESTRION__?.transformedModules).toEqual(['pg', 'openai']);
  });

  it('emits an empty list when nothing was transformed', () => {
    sentryOrchestrionPlugin({ registerIntegrations: true });
    const injectDiagnostics = captured.options?.injectDiagnostics as (d: {
      transformedModules: string[];
      failedModules: string[];
    }) => string;

    // eslint-disable-next-line no-eval
    (0, eval)(injectDiagnostics({ transformedModules: [], failedModules: [] }));
    expect(globalThis.__SENTRY_ORCHESTRION__?.transformedModules).toEqual([]);
    expect(globalThis.__SENTRY_ORCHESTRION__?.failedModules).toEqual([]);
  });

  it('records failed modules on the marker and warns once at build time', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sentryOrchestrionPlugin({ registerIntegrations: true });
    const injectDiagnostics = captured.options?.injectDiagnostics as (d: {
      transformedModules: string[];
      failedModules: string[];
    }) => string;

    // The transformer invokes the callback once per emitted chunk — the
    // warning must not repeat per chunk.
    const banner = injectDiagnostics({ transformedModules: ['pg'], failedModules: ['mysql'] });
    injectDiagnostics({ transformedModules: ['pg'], failedModules: ['mysql'] });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('mysql'));

    // eslint-disable-next-line no-eval
    (0, eval)(banner);
    expect(globalThis.__SENTRY_ORCHESTRION__?.failedModules).toEqual(['mysql']);

    warnSpy.mockRestore();
  });

  it('does not warn when no transform failed', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    sentryOrchestrionPlugin({ registerIntegrations: true });
    const injectDiagnostics = captured.options?.injectDiagnostics as (d: {
      transformedModules: string[];
      failedModules: string[];
    }) => string;

    injectDiagnostics({ transformedModules: ['pg'], failedModules: [] });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
