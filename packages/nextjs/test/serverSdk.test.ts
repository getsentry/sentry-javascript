import type { Integration } from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';
import { getCurrentScope } from '@sentry/node';
import * as SentryNode from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from '../src/server';

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewriteFramesDistDir: string })._sentryRewriteFramesDistDir = '.next';

const nodeInit = vi.spyOn(SentryNode, 'init');

function findIntegrationByName(integrations: Integration[] = [], name: string): Integration | undefined {
  return integrations.find(integration => integration.name === name);
}

describe('Server init()', () => {
  afterEach(() => {
    vi.clearAllMocks();

    SentryNode.getGlobalScope().clear();
    SentryNode.getIsolationScope().clear();
    SentryNode.getCurrentScope().clear();
    SentryNode.getCurrentScope().setClient(undefined);

    delete process.env.VERCEL;
  });

  it('inits the Node SDK', () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    expect(nodeInit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        _metadata: {
          sdk: {
            name: 'sentry.javascript.nextjs',
            version: expect.any(String),
            packages: [
              {
                name: 'npm:@sentry/nextjs',
                version: expect.any(String),
              },
              {
                name: 'npm:@sentry/node',
                version: expect.any(String),
              },
            ],
          },
        },
        environment: 'test',

        // Integrations are tested separately, and we can't be more specific here without depending on the order in
        // which integrations appear in the array, which we can't guarantee.
        //
        // TODO: If we upgrade to Jest 28+, we can follow Jest's example matcher and create an
        // `expect.ArrayContainingInAnyOrder`. See
        // https://github.com/facebook/jest/blob/main/examples/expect-extend/toBeWithinRange.ts.
        defaultIntegrations: expect.any(Array),
      }),
    );
  });

  it("doesn't reinitialize the node SDK if already initialized", () => {
    expect(nodeInit).toHaveBeenCalledTimes(0);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
    init({});
    expect(nodeInit).toHaveBeenCalledTimes(1);
  });

  // TODO: test `vercel` tag when running on Vercel
  // Can't just add the test and set env variables, since the value in `index.server.ts`
  // is resolved when importing.

  it('does not apply `vercel` tag when not running on vercel', () => {
    const currentScope = getCurrentScope();

    expect(process.env.VERCEL).toBeUndefined();

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags.vercel).toBeUndefined();
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/node`'s `init` after modifying them
    type ModifiedInitOptions = { integrations: Integration[]; defaultIntegrations: Integration[] };

    it('adds default integrations', () => {
      init({});

      const nodeInitOptions = nodeInit.mock.calls[0]?.[0] as ModifiedInitOptions;
      const integrationNames = nodeInitOptions.defaultIntegrations.map(integration => integration.name);
      const onUncaughtExceptionIntegration = findIntegrationByName(
        nodeInitOptions.defaultIntegrations,
        'OnUncaughtException',
      );

      expect(integrationNames).toContain('DistDirRewriteFrames');
      expect(onUncaughtExceptionIntegration).toBeDefined();
    });

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [SentryNode.consoleIntegration()] });

      const nodeInitOptions = nodeInit.mock.calls[0]?.[0] as ModifiedInitOptions;
      const consoleIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Console');

      expect(consoleIntegration).toBeDefined();
    });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });

  describe('OpenNext/Cloudflare runtime detection', () => {
    const cloudflareContextSymbol = Symbol.for('__cloudflare-context__');

    beforeEach(() => {
      // Reset the global scope to allow re-initialization
      SentryNode.getGlobalScope().clear();
      SentryNode.getIsolationScope().clear();
      SentryNode.getCurrentScope().clear();
      SentryNode.getCurrentScope().setClient(undefined);
    });

    afterEach(() => {
      // Clean up the cloudflare context
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[cloudflareContextSymbol];
    });

    it('sets cloudflare runtime when OpenNext context is available', () => {
      // Mock the OpenNext Cloudflare context
      (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[cloudflareContextSymbol] = {
        ctx: {
          waitUntil: vi.fn(),
        },
      };

      init({});

      expect(nodeInit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          runtime: { name: 'cloudflare' },
        }),
      );
    });

    it('sets cloudflare in SDK metadata when OpenNext context is available', () => {
      // Mock the OpenNext Cloudflare context
      (GLOBAL_OBJ as unknown as Record<symbol, unknown>)[cloudflareContextSymbol] = {
        ctx: {
          waitUntil: vi.fn(),
        },
      };

      init({});

      expect(nodeInit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          _metadata: expect.objectContaining({
            sdk: expect.objectContaining({
              name: 'sentry.javascript.nextjs',
              packages: expect.arrayContaining([
                expect.objectContaining({
                  name: 'npm:@sentry/nextjs',
                }),
                expect.objectContaining({
                  name: 'npm:@sentry/cloudflare',
                }),
              ]),
            }),
          }),
        }),
      );
    });

    it('does not set cloudflare runtime when OpenNext context is not available', () => {
      init({});

      expect(nodeInit).toHaveBeenLastCalledWith(
        expect.not.objectContaining({
          runtime: { name: 'cloudflare' },
        }),
      );
    });
  });
});
