import * as SentryNode from '@sentry/node-experimental';
import { getClient, getCurrentScope } from '@sentry/node-experimental';
import type { Integration } from '@sentry/types';
import { GLOBAL_OBJ, logger } from '@sentry/utils';

import { Integrations, init } from '../src/server';

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
        autoSessionTracking: false,
        environment: 'test',

        // Integrations are tested separately, and we can't be more specific here without depending on the order in
        // which integrations appear in the array, which we can't guarantee.
        //
        // TODO: If we upgrde to Jest 28+, we can follow Jest's example matcher and create an
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

  it('sets runtime on scope', () => {
    expect(SentryNode.getIsolationScope().getScopeData().tags).toEqual({});

    init({ dsn: 'https://public@dsn.ingest.sentry.io/1337' });

    expect(SentryNode.getIsolationScope().getScopeData().tags).toEqual({ runtime: 'node' });
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

  it('adds 404 transaction filter', async () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const transportSend = jest.spyOn(getClient()!.getTransport()!, 'send');

    SentryNode.startSpan({ name: '/404' }, () => {
      // noop
    });

    // We need to flush because the event processor pipeline is async whereas transaction.end() is sync.
    await SentryNode.flush();

    expect(transportSend).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith('An event processor returned `null`, will not send event.');
  });

  describe('integrations', () => {
    // Options passed by `@sentry/nextjs`'s `init` to `@sentry/node`'s `init` after modifying them
    type ModifiedInitOptions = { integrations: Integration[]; defaultIntegrations: Integration[] };

    it('adds default integrations', () => {
      init({});

      const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
      const integrationNames = nodeInitOptions.defaultIntegrations.map(integration => integration.name);
      const httpIntegration = findIntegrationByName(nodeInitOptions.defaultIntegrations, 'Http');
      const onUncaughtExceptionIntegration = findIntegrationByName(
        nodeInitOptions.defaultIntegrations,
        'OnUncaughtException',
      );

      expect(integrationNames).toContain('DistDirRewriteFrames');
      expect(httpIntegration).toBeDefined();
      expect(onUncaughtExceptionIntegration).toBeDefined();
    });

    it('supports passing unrelated integrations through options', () => {
      init({ integrations: [new Integrations.Console()] });

      const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
      const consoleIntegration = findIntegrationByName(nodeInitOptions.integrations, 'Console');

      expect(consoleIntegration).toBeDefined();
    });

    describe('`Http` integration', () => {
      it('adds `Http` integration with tracing enabled by default', () => {
        init({ tracesSampleRate: 1.0 });

        const nodeInitOptions = nodeInit.mock.calls[0][0] as ModifiedInitOptions;
        const httpIntegration = findIntegrationByName(nodeInitOptions.defaultIntegrations, 'Http');

        expect(httpIntegration).toBeDefined();
        expect(httpIntegration).toEqual(expect.objectContaining({ _tracing: {} }));
      });
    });
  });
});
