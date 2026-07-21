import type { Client, Integration } from '@sentry/core';
import { getCurrentScope, GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOrchestrionChannelIntegration } from '../../src/orchestrion/registerChannelIntegration';

describe('registerOrchestrionChannelIntegration', () => {
  const factory = (name: string) => (): Integration => ({ name, setupOnce: () => undefined });

  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    getCurrentScope().setClient(undefined);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    getCurrentScope().setClient(undefined);
  });

  it('stores the factory on the global marker keyed by its export name', () => {
    const fn = factory('MyIntegration');
    registerOrchestrionChannelIntegration('myChannelIntegration', fn);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.get('myChannelIntegration')).toBe(fn);
  });

  it('keeps one entry per export name (a package split across files registers once)', () => {
    registerOrchestrionChannelIntegration('myChannelIntegration', factory('MyIntegration'));
    registerOrchestrionChannelIntegration('myChannelIntegration', factory('MyIntegration'));
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.size).toBe(1);
  });

  it('live-registers the integration on an already-set client', () => {
    const addIntegration = vi.fn();
    getCurrentScope().setClient({ addIntegration } as unknown as Client);

    registerOrchestrionChannelIntegration('myChannelIntegration', factory('MyIntegration'));

    expect(addIntegration).toHaveBeenCalledTimes(1);
    expect(addIntegration.mock.calls[0]?.[0]).toMatchObject({ name: 'MyIntegration' });
  });

  it('does not throw the live add when no client is set yet', () => {
    expect(() => registerOrchestrionChannelIntegration('myChannelIntegration', factory('X'))).not.toThrow();
    // still stored for the next init() to pick up
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.integrations?.has('myChannelIntegration')).toBe(true);
  });
});
