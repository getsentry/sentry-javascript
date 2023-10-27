import { runWithAsyncContext } from '@sentry/core';
import * as SentryNode from '@sentry/node';
import { getCurrentHub, NodeClient } from '@sentry/node';
import type { Integration } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { init } from '../src/server';

const { Integrations } = SentryNode;

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { __rewriteFramesDistDir__: string }).__rewriteFramesDistDir__ = '.next';

const nodeInit = jest.spyOn(SentryNode, 'init');
const loggerLogSpy = jest.spyOn(logger, 'log');

function findIntegrationByName(integrations: Integration[] = [], name: string): Integration | undefined {
  return integrations.find(integration => integration.name === name);
}

describe('Server init()', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error for testing
    delete GLOBAL_OBJ.__SENTRY__;
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
        autoSessionTracking: false,
        environment: 'test',

        // Integrations are tested separately, and we can't be more specific here without depending on the order in
        // which integrations appear in the array, which we can't guarantee.
        //
        // TODO: If we upgrde to Jest 28+, we can follow Jest's example matcher and create an
        // `expect.ArrayContainingInAnyOrder`. See
        // https://github.com/facebook/jest/blob/main/examples/expect-extend/toBeWithinRange.ts.
        integrations: expect.any(Array),
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

  it('sets runtime on scope', () => {
    const currentScope = getCurrentHub().getScope();

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'node' });
  });

  // TODO: test `vercel` tag when running on Vercel
  // Can't just add the test and set env variables, since the value in `index.server.ts`
  // is resolved when importing.

  it('does not apply `vercel` tag when not running on vercel', () => {
    const currentScope = getCurrentHub().getScope();

    expect(process.env.VERCEL).toBeUndefined();

    init({});

    // @ts-expect-error need access to protected _tags attribute
    expect(currentScope._tags.vercel).toBeUndefined();
  });

  it('adds 404 transaction filter', async () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const hub = getCurrentHub();
    const transportSend = jest.spyOn(hub.getClient()!.getTransport()!, 'send');

    const transaction = hub.startTransaction({ name: '/404' });
    transaction.finish();

    // We need to flush because the event processor pipeline is async whereas transaction.finish() is sync.
    await SentryNode.flush();

    expect(transportSend).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith('An event processor returned `null`, will not send event.');
  });

  it("initializes both global hub and domain hub when there's an active domain", () => {
    const globalHub = getCurrentHub();

    runWithAsyncContext(() => {
      const globalHub2 = getCurrentHub();
      // If we call runWithAsyncContext before init, it executes the callback in the same context as there is no
      // strategy yet
      expect(globalHub2).toBe(globalHub);
      expect(globalHub.getClient()).toBeUndefined();
      expect(globalHub2.getClient()).toBeUndefined();

      init({});

      runWithAsyncContext(() => {
        const domainHub = getCurrentHub();
        // this tag should end up only in the domain hub
        domainHub.setTag('dogs', 'areGreat');

        expect(globalHub.getClient()).toEqual(expect.any(NodeClient));
        expect(domainHub.getClient()).toBe(globalHub.getClient());
        // @ts-expect-error need access to protected _tags attribute
        expect(globalHub.getScope()._tags).toEqual({ runtime: 'node' });
        // @ts-expect-error need access to protected _tags attribute
        expect(domainHub.getScope()._tags).toEqual({ runtime: 'node', dogs: 'areGreat' });
      });
    });
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/node`'s `init` after modifying them
    type ModifiedInitOptions = { integrations: Integration[] };

    it('adds default integrations', () => {
      init({});

      const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
      const rewriteFramesIntegration = findIntegrationByName(nodeInitOptions.integrations, 'RewriteFrames');

      expect(rewriteFramesIntegration).toBeDefined();
    });

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [new Integrations.Console()] });

      const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
      const consoleIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Console');

      expect(consoleIntegration).toBeDefined();
    });

    describe('`Http` integration', () => {
      it('adds `Http` integration with tracing enabled if `tracesSampleRate` is set', () => {
        init({ tracesSampleRate: 1.0 });

        const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
        const httpIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Http');

        expect(httpIntegration).toBeDefined();
        expect(httpIntegration).toEqual(expect.objectContaining({ _tracing: {} }));
      });

      it('adds `Http` integration with tracing enabled if `tracesSampler` is set', () => {
        init({ tracesSampler: () => true });

        const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
        const httpIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Http');

        expect(httpIntegration).toBeDefined();
        expect(httpIntegration).toEqual(expect.objectContaining({ _tracing: {} }));
      });

      it('forces `_tracing = true` if `tracesSampleRate` is set', () => {
        init({
          tracesSampleRate: 1.0,
          integrations: [new Integrations.Http({ tracing: false })],
        });

        const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
        const httpIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Http');

        expect(httpIntegration).toBeDefined();
        expect(httpIntegration).toEqual(expect.objectContaining({ _tracing: {} }));
      });

      it('forces `_tracing = true` if `tracesSampler` is set', () => {
        init({
          tracesSampler: () => true,
          integrations: [new Integrations.Http({ tracing: false })],
        });

        const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
        const httpIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Http');

        expect(httpIntegration).toBeDefined();
        expect(httpIntegration).toEqual(expect.objectContaining({ _tracing: {} }));
      });
    });
  });
});
