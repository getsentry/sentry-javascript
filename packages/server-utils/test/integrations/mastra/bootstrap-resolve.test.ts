import { tracingChannel } from 'node:diagnostics_channel';
import type { Client } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mastraIntegration } from '../../../src/integrations/mastra';
import { CHANNELS } from '../../../src/orchestrion/channels';

const observabilityFrom = vi.hoisted(() => ({
  parent: undefined as string | undefined,
  cache: {} as NodeJS.Dict<NodeModule>,
  loadedCore: '/app/node_modules/@mastra/core/dist/index.js',
  cwdCore: '/cwd/node_modules/@mastra/core/index.js',
  cwd: `${process.cwd()}/noop.js`,
  failParents: [] as string[],
}));

vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createRequire: (filename: string) => {
      const req = ((id: string) => {
        if (id === '@mastra/observability') {
          if (observabilityFrom.failParents.includes(filename)) {
            throw new Error(`not visible from ${filename}`);
          }
          observabilityFrom.parent = filename;
          return {
            Observability: class Observability {},
            DefaultObservabilityInstance: class DefaultObservabilityInstance {},
          };
        }
        throw new Error(`unexpected require: ${id}`);
      }) as NodeJS.Require;
      req.cache = observabilityFrom.cache;
      req.resolve = (id: string) => {
        if (id === '@mastra/core') {
          return observabilityFrom.cwdCore;
        }
        throw new Error(`unexpected resolve: ${id}`);
      };
      return req;
    },
  };
});

describe('mastraIntegration observability resolve', () => {
  beforeEach(() => {
    observabilityFrom.parent = undefined;
    observabilityFrom.cache = {};
    observabilityFrom.failParents = [];
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@mastra/core'] };
    mastraIntegration().setup?.({
      on: () => () => undefined,
    } as unknown as Client);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it('loads @mastra/observability from a loaded @mastra/core file, not cwd', () => {
    observabilityFrom.cache[observabilityFrom.loadedCore] = {} as NodeModule;
    const registerExporter = vi.fn();

    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });

    expect(observabilityFrom.parent).toBe(observabilityFrom.loadedCore);
    expect(registerExporter).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });

  it('falls back to resolving @mastra/core from cwd when it is not in the CJS cache', () => {
    const registerExporter = vi.fn();

    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });

    expect(observabilityFrom.parent).toBe(observabilityFrom.cwdCore);
    expect(registerExporter).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });

  it('falls back to cwd-resolved core when the cached copy cannot see @mastra/observability', () => {
    observabilityFrom.cache[observabilityFrom.loadedCore] = {} as NodeModule;
    observabilityFrom.failParents = [observabilityFrom.loadedCore];
    const registerExporter = vi.fn();

    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });

    expect(observabilityFrom.parent).toBe(observabilityFrom.cwdCore);
    expect(registerExporter).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });

  it('loads @mastra/observability from cwd when no core parent can see it', () => {
    observabilityFrom.cache[observabilityFrom.loadedCore] = {} as NodeModule;
    observabilityFrom.failParents = [observabilityFrom.loadedCore, observabilityFrom.cwdCore];
    const registerExporter = vi.fn();

    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });

    expect(observabilityFrom.parent).toBe(observabilityFrom.cwd);
    expect(registerExporter).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything());
  });

  it('warns once when @mastra/observability cannot be loaded', () => {
    observabilityFrom.failParents = [observabilityFrom.loadedCore, observabilityFrom.cwdCore, observabilityFrom.cwd];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const registerExporter = vi.fn();

    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });
    tracingChannel(CHANNELS.MASTRA_CONSTRUCTOR).end.publish({
      self: { registerExporter },
      arguments: [],
    });

    expect(registerExporter).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('@mastra/observability'));

    warn.mockRestore();
  });
});
