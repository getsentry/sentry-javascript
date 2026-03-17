import * as SentryCore from '@sentry/core';
import { SDK_VERSION } from '@sentry/core';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { sentry } from '../../src/node/middleware';
import type { Integration } from '@sentry/core';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
const { init: initNodeMock } = await vi.importMock<typeof import('@sentry/node')>('@sentry/node');

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    applySdkMetadata: vi.fn(actual.applySdkMetadata),
  };
});

const applySdkMetadataMock = SentryCore.applySdkMetadata as Mock;

describe('Hono Node Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sentry middleware', () => {
    it('calls applySdkMetadata with "hono"', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(applySdkMetadataMock).toHaveBeenCalledTimes(1);
      expect(applySdkMetadataMock).toHaveBeenCalledWith(options, 'hono', ['hono', 'node']);
    });

    it('calls init from @sentry/node', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initNodeMock).toHaveBeenCalledTimes(1);
      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
        }),
      );
    });

    it('sets SDK metadata before calling Node init', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      const applySdkMetadataCallOrder = applySdkMetadataMock.mock.invocationCallOrder[0];
      const initNodeCallOrder = (initNodeMock as Mock).mock.invocationCallOrder[0];

      expect(applySdkMetadataCallOrder).toBeLessThan(initNodeCallOrder as number);
    });

    it('preserves all user options', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
        environment: 'production',
        sampleRate: 0.5,
        tracesSampleRate: 1.0,
        debug: true,
      };

      sentry(app, options);

      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          environment: 'production',
          sampleRate: 0.5,
          tracesSampleRate: 1.0,
          debug: true,
        }),
      );
    });

    it('returns a middleware handler function', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      const middleware = sentry(app, options);

      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
      expect(middleware).toHaveLength(2); // Hono middleware takes (context, next)
    });

    it('returns an async middleware handler', () => {
      const app = new Hono();
      const middleware = sentry(app, {});

      expect(middleware.constructor.name).toBe('AsyncFunction');
    });

    it('passes an integrations function to initNode (never a raw array)', () => {
      const app = new Hono();
      sentry(app, { dsn: 'https://public@dsn.ingest.sentry.io/1337' });

      const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
      expect(typeof callArgs.integrations).toBe('function');
    });

    it('includes hono SDK metadata', () => {
      const app = new Hono();
      const options = {
        dsn: 'https://public@dsn.ingest.sentry.io/1337',
      };

      sentry(app, options);

      expect(initNodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          _metadata: expect.objectContaining({
            sdk: expect.objectContaining({
              name: 'sentry.javascript.hono',
              version: SDK_VERSION,
              packages: [
                { name: 'npm:@sentry/hono', version: SDK_VERSION },
                { name: 'npm:@sentry/node', version: SDK_VERSION },
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('Hono integration filtering', () => {
    const honoIntegration = { name: 'Hono' } as Integration;
    const otherIntegration = { name: 'Other' } as Integration;

    const getIntegrationsFn = (): ((defaults: Integration[]) => Integration[]) => {
      const callArgs = (initNodeMock as Mock).mock.calls[0]?.[0];
      return callArgs.integrations as (defaults: Integration[]) => Integration[];
    };

    describe('when integrations is an array', () => {
      it('keeps a user-explicitly-provided Hono integration', () => {
        const app = new Hono();
        sentry(app, { integrations: [honoIntegration, otherIntegration] });

        const integrationsFn = getIntegrationsFn();
        const result = integrationsFn([]);
        expect(result.map(i => i.name)).toContain('Hono');
        expect(result.map(i => i.name)).toContain('Other');
      });

      it('keeps non-Hono user integrations', () => {
        const app = new Hono();
        sentry(app, { integrations: [otherIntegration] });

        const integrationsFn = getIntegrationsFn();
        expect(integrationsFn([])).toEqual([otherIntegration]);
      });

      it('preserves user-provided Hono even when defaults would also provide it', () => {
        const app = new Hono();
        sentry(app, { integrations: [honoIntegration] });

        const integrationsFn = getIntegrationsFn();
        // Defaults include Hono, but it should be filtered from defaults; user's copy is kept
        const result = integrationsFn([honoIntegration, otherIntegration]);
        expect(result.filter(i => i.name === 'Hono')).toHaveLength(1);
      });

      it('removes Hono from defaults when user does not explicitly provide it', () => {
        const app = new Hono();
        sentry(app, { integrations: [otherIntegration] });

        const integrationsFn = getIntegrationsFn();
        const defaultsWithHono = [honoIntegration, otherIntegration];
        const result = integrationsFn(defaultsWithHono);
        expect(result.map(i => i.name)).not.toContain('Hono');
      });

      it('deduplicates non-Hono integrations when user integrations overlap with defaults', () => {
        const app = new Hono();
        const duplicateIntegration = { name: 'Other' } as Integration;
        sentry(app, { integrations: [duplicateIntegration] });

        const integrationsFn = getIntegrationsFn();
        const defaultsWithOverlap = [honoIntegration, otherIntegration];
        const result = integrationsFn(defaultsWithOverlap);
        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('Other');
      });
    });

    describe('when integrations is a function', () => {
      it('passes defaults without Hono to the user function', () => {
        const app = new Hono();
        const userFn = vi.fn((_defaults: Integration[]) => [otherIntegration]);
        const defaultIntegration = { name: 'Default' } as Integration;

        sentry(app, { integrations: userFn });

        const integrationsFn = getIntegrationsFn();
        integrationsFn([honoIntegration, defaultIntegration]);

        const receivedDefaults = userFn.mock.calls[0]?.[0] as Integration[];
        expect(receivedDefaults.map(i => i.name)).not.toContain('Hono');
        expect(receivedDefaults.map(i => i.name)).toContain('Default');
      });

      it('preserves a Hono integration explicitly returned by the user function', () => {
        const app = new Hono();
        sentry(app, { integrations: () => [honoIntegration, otherIntegration] });

        const integrationsFn = getIntegrationsFn();
        const result = integrationsFn([]);
        expect(result.map(i => i.name)).toContain('Hono');
        expect(result.map(i => i.name)).toContain('Other');
      });

      it('does not include Hono when user function just returns defaults', () => {
        const app = new Hono();
        sentry(app, { integrations: (defaults: Integration[]) => defaults });

        const integrationsFn = getIntegrationsFn();
        const result = integrationsFn([honoIntegration, otherIntegration]);
        expect(result.map(i => i.name)).not.toContain('Hono');
        expect(result.map(i => i.name)).toContain('Other');
      });
    });

    describe('when integrations is undefined', () => {
      it('removes Hono from defaults', () => {
        const app = new Hono();
        sentry(app, {});

        const integrationsFn = getIntegrationsFn();
        expect(integrationsFn([honoIntegration, otherIntegration])).toEqual([otherIntegration]);
      });
    });
  });
});
