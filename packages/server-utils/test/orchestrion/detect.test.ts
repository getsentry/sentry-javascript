import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectOrchestrionSetup, getOrchestrionInjectedModules } from '../../src/orchestrion/detect';

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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('always warns on Bun when no injection is detected', () => {
    vi.stubGlobal('Bun', {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('@sentry/bun/plugin');
  });

  it('does not warn on Bun when the bundler plugin ran', () => {
    vi.stubGlobal('Bun', {});
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { bundler: new Set() };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn outside Bun when debug is off', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    detectOrchestrionSetup();

    expect(warn).not.toHaveBeenCalled();
  });
});
