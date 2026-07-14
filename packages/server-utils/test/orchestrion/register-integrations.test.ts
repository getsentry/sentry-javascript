import { debug } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRegisteredChannelIntegrations } from '../../src/orchestrion/detect';
import { channelIntegrations, registerChannelIntegrations } from '../../src/orchestrion/index';

describe('channel-integration registry', () => {
  beforeEach(() => {
    delete globalThis.__SENTRY_ORCHESTRION__;
  });

  afterEach(() => {
    delete globalThis.__SENTRY_ORCHESTRION__;
  });

  describe('getRegisteredChannelIntegrations', () => {
    it('returns an empty array when no marker exists', () => {
      expect(getRegisteredChannelIntegrations()).toEqual([]);
    });

    it('returns an empty array when the marker has no integrations', () => {
      globalThis.__SENTRY_ORCHESTRION__ = { bundler: true };
      expect(getRegisteredChannelIntegrations()).toEqual([]);
    });

    it('instantiates each registered factory', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        integrations: [
          { factory: () => ({ name: 'FirstIntegration' }), modules: ['a'] },
          { factory: () => ({ name: 'SecondIntegration' }), modules: ['b'] },
        ],
      };

      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['FirstIntegration', 'SecondIntegration']);
    });

    it('returns fresh instances on every call', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        integrations: [{ factory: () => ({ name: 'FirstIntegration' }), modules: ['a'] }],
      };

      const [first] = getRegisteredChannelIntegrations();
      const [second] = getRegisteredChannelIntegrations();

      expect(first).not.toBe(second);
      expect(first?.name).toBe(second?.name);
    });

    it('activates only integrations whose module was transformed', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        transformedModules: ['pg'],
        integrations: [
          { factory: () => ({ name: 'Postgres' }), modules: ['pg', 'pg-pool'] },
          { factory: () => ({ name: 'MySQL' }), modules: ['mysql'] },
        ],
      };

      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['Postgres']);
    });

    it('matches when any of an integration’s modules was transformed', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        transformedModules: ['pg-pool'],
        integrations: [{ factory: () => ({ name: 'Postgres' }), modules: ['pg', 'pg-pool'] }],
      };

      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['Postgres']);
    });

    it('activates nothing when the transformed-module list is empty', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        transformedModules: [],
        integrations: [{ factory: () => ({ name: 'Postgres' }), modules: ['pg'] }],
      };

      expect(getRegisteredChannelIntegrations()).toEqual([]);
    });

    it('activates every registered integration when no transformed-module list is present', () => {
      globalThis.__SENTRY_ORCHESTRION__ = {
        integrations: [
          { factory: () => ({ name: 'Postgres' }), modules: ['pg'] },
          { factory: () => ({ name: 'MySQL' }), modules: ['mysql'] },
        ],
      };

      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['Postgres', 'MySQL']);
    });

    it('warns about modules whose build-time transform failed, once per isolate', () => {
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => undefined);

      globalThis.__SENTRY_ORCHESTRION__ = {
        transformedModules: ['pg'],
        failedModules: ['mysql'],
        integrations: [
          { factory: () => ({ name: 'Postgres' }), modules: ['pg'] },
          { factory: () => ({ name: 'MySQL' }), modules: ['mysql'] },
        ],
      };

      // Cloudflare re-reads the marker on every request; the warning must not
      // repeat, so a second call stays silent.
      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['Postgres']);
      getRegisteredChannelIntegrations();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('mysql'));

      warnSpy.mockRestore();
    });

    it('does not warn when the failed-module list is empty', () => {
      const warnSpy = vi.spyOn(debug, 'warn').mockImplementation(() => undefined);

      globalThis.__SENTRY_ORCHESTRION__ = {
        transformedModules: ['pg'],
        failedModules: [],
        integrations: [{ factory: () => ({ name: 'Postgres' }), modules: ['pg'] }],
      };

      expect(getRegisteredChannelIntegrations().map(i => i.name)).toEqual(['Postgres']);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('registerChannelIntegrations', () => {
    it('registers a factory for every canonical channel integration', () => {
      registerChannelIntegrations();

      const registered = getRegisteredChannelIntegrations();
      expect(registered).toHaveLength(Object.keys(channelIntegrations).length);
      expect(registered.every(i => typeof i.name === 'string' && i.name.length > 0)).toBe(true);
    });

    it('creates the marker when none exists', () => {
      registerChannelIntegrations();

      expect(globalThis.__SENTRY_ORCHESTRION__?.integrations).toBeDefined();
    });

    it('preserves existing marker fields', () => {
      globalThis.__SENTRY_ORCHESTRION__ = { bundler: true, runtime: true };

      registerChannelIntegrations();

      expect(globalThis.__SENTRY_ORCHESTRION__?.bundler).toBe(true);
      expect(globalThis.__SENTRY_ORCHESTRION__?.runtime).toBe(true);
      expect(getRegisteredChannelIntegrations().length).toBeGreaterThan(0);
    });

    it('registers factories, not eagerly-built instances', () => {
      registerChannelIntegrations();

      expect(globalThis.__SENTRY_ORCHESTRION__?.integrations?.every(entry => typeof entry.factory === 'function')).toBe(
        true,
      );
    });

    it('pairs every registered factory with a non-empty module list', () => {
      registerChannelIntegrations();

      expect(
        globalThis.__SENTRY_ORCHESTRION__?.integrations?.every(
          entry => Array.isArray(entry.modules) && entry.modules.length > 0,
        ),
      ).toBe(true);
    });
  });
});
