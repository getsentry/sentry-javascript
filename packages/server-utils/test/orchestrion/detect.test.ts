import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getOrchestrionInjectedModules } from '../../src/orchestrion/detect';

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
