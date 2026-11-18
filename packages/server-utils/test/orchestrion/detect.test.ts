import { getCurrentScope, GLOBAL_OBJ, setCurrentClient, startSpan } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOrchestrionSetup, getOrchestrionInjectedModules } from '../../src/orchestrion/detect';
import { getDefaultTestClientOptions, TestClient } from '../mocks/client';

describe('getOrchestrionInjectedModules', () => {
  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it('is empty when no marker exists', () => {
    expect(getOrchestrionInjectedModules()).toEqual([]);
  });

  it('merges the runtime list and the bundler set', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['pg'], bundler: new Set(['mysql']) };
    expect(getOrchestrionInjectedModules()).toEqual(['pg', 'mysql']);
  });

  it('ignores a foreign non-Set bundler flag', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['pg'], bundler: true as unknown as Set<string> };
    expect(getOrchestrionInjectedModules()).toEqual(['pg']);
  });
});

describe('detectOrchestrionSetup', () => {
  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    getCurrentScope().setClient(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('always warns on Bun when no injection is detected', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('@sentry/bun/plugin'));
  });

  it('warns on Bun only once when called again, as on a repeated `init()`', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();
    detectOrchestrionSetup();

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('does not warn on Bun when no channel integration is installed', () => {
    vi.stubGlobal('Bun', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn on Bun when the bundler plugin ran', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { bundler: new Set(), channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on Bun at the first span instead of at init when spans are enabled', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();

    startSpan({ name: 'first' }, () => undefined);
    startSpan({ name: 'second' }, () => undefined);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('@sentry/bun/plugin'));
  });

  it('does not warn on Bun when the app sets the bundler marker after init, as with `bun --preload`', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1 }));
    setCurrentClient(client);
    client.init();

    detectOrchestrionSetup();
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__.bundler = new Set();
    startSpan({ name: 'request' }, () => undefined);

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn outside Bun when debug is off', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { channelIntegrations: true };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();
  });
});
