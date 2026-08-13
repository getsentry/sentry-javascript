import type { Client, Integration } from '@sentry/core';
import { getCurrentScope, GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orchestrionModuleInjected } from '../../src/orchestrion/moduleInjected';

describe('orchestrionModuleInjected', () => {
  const factory = (name: string) => (): Integration => ({ name, setupOnce: () => undefined });

  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    getCurrentScope().setClient(undefined);
  });

  it('records the module name as bundler-injected', () => {
    orchestrionModuleInjected('mysql');
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql']);
  });

  it('deduplicates the recorded module across repeated calls', () => {
    orchestrionModuleInjected('mysql');
    orchestrionModuleInjected('mysql');
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql']);
  });

  it('stores the factories on the global marker keyed by module name', () => {
    const orchestrion = factory('RedisChannel');
    const native = factory('Redis');
    orchestrionModuleInjected('redis', orchestrion, native);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.get('redis')).toEqual([orchestrion, native]);
  });

  // The one-factory call is the shape every earlier bundle emits, and the shape
  // all but redis emit today. It is a plain subset of the variadic signature.
  it('stores a single factory', () => {
    const fn = factory('Mysql');
    orchestrionModuleInjected('mysql', fn);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.get('mysql')).toEqual([fn]);
  });

  it('stores no factory when none is given', () => {
    orchestrionModuleInjected('mongodb');
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations).toBeUndefined();
  });

  it('emits the module-injected event on the current client, after recording', () => {
    const emit = vi.fn(() => {
      // Listeners react by reading the marker, so it must be recorded by now.
      expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql']);
      expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.has('mysql')).toBe(true);
    });
    getCurrentScope().setClient({ emit } as unknown as Client);

    orchestrionModuleInjected('mysql', factory('Mysql'));

    expect(emit).toHaveBeenCalledWith('orchestrion.module-injected', 'mysql');
  });

  it('does not throw when no client is set yet', () => {
    expect(() => orchestrionModuleInjected('mysql', factory('Mysql'))).not.toThrow();
    // still recorded for the next init() to pick up
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler).toEqual(['mysql']);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.has('mysql')).toBe(true);
  });

  it('does not install the integration itself — installing is SDK policy', () => {
    const addIntegration = vi.fn();
    const emit = vi.fn();
    getCurrentScope().setClient({ addIntegration, emit } as unknown as Client);

    orchestrionModuleInjected('mysql', factory('Mysql'));

    expect(addIntegration).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('orchestrion.module-injected', 'mysql');
  });

  it('leaves a foreign non-array bundler flag untouched but still stores and emits', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { bundler: true as unknown as string[] };
    const emit = vi.fn();
    getCurrentScope().setClient({ emit } as unknown as Client);

    orchestrionModuleInjected('mysql', factory('Mysql'));

    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.bundler).toBe(true);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.has('mysql')).toBe(true);
    expect(emit).toHaveBeenCalledWith('orchestrion.module-injected', 'mysql');
  });
});
