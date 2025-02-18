import { GLOBAL_OBJ } from '@sentry/core';
import { getCurrentScope } from '@sentry/node';
import * as SentryNode from '@sentry/node';

import { init } from '../src/server';

// normally this is set as part of the build process, so mock it here
(GLOBAL_OBJ as typeof GLOBAL_OBJ & { _sentryRewriteFramesDistDir: string })._sentryRewriteFramesDistDir = '.next';

const nodeInit = jest.spyOn(SentryNode, 'initWithDefaultIntegrations');

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
        environment: 'test',
      }),
      expect.any(Function),
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
    it('adds default integrations', () => {
      const client = init({ dsn: 'http://examplePublicKey@localhost/1' });

      const onUncaughtExceptionIntegration = client?.getIntegrationByName('OnUncaughtException');
      const rewriteFramesIntegration = client?.getIntegrationByName('DistDirRewriteFrames');

      expect(rewriteFramesIntegration).toBeDefined();
      expect(onUncaughtExceptionIntegration).toBeDefined();
    });

    it('supports passing unrelated integrations through options', () => {
      const client = init({
        dsn: 'http://examplePublicKey@localhost/1',
        integrations: [SentryNode.consoleIntegration()],
      });

      const consoleIntegration = client?.getIntegrationByName('Console');
      expect(consoleIntegration).toBeDefined();
    });
  });

  it('returns client from init', () => {
    expect(init({})).not.toBeUndefined();
  });
});
