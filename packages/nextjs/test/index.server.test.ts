import { RewriteFrames } from '@sentry/integrations';
import * as SentryNode from '@sentry/node';
import { getCurrentHub, NodeClient } from '@sentry/node';
import { Integration } from '@sentry/types';
import { getGlobalObject, logger, SentryError } from '@sentry/utils';
import * as domain from 'domain';

import { init } from '../src/index.server';
import { NextjsOptions } from '../src/utils/nextjsOptions';

const { Integrations } = SentryNode;

const global = getGlobalObject();

// normally this is set as part of the build process, so mock it here
(global as typeof global & { __rewriteFramesDistDir__: string }).__rewriteFramesDistDir__ = '.next';

const nodeInit = jest.spyOn(SentryNode, 'init');
const logError = jest.spyOn(logger, 'error');

describe('Server init()', () => {
  afterEach(() => {
    jest.clearAllMocks();
    global.__SENTRY__.hub = undefined;
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
        integrations: [expect.any(RewriteFrames)],
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

    // @ts-ignore need access to protected _tags attribute
    expect(currentScope._tags).toEqual({});

    init({});

    // @ts-ignore need access to protected _tags attribute
    expect(currentScope._tags).toEqual({ runtime: 'node' });
  });

  // TODO: test `vercel` tag when running on Vercel
  // Can't just add the test and set env variables, since the value in `index.server.ts`
  // is resolved when importing.

  it('does not apply `vercel` tag when not running on vercel', () => {
    const currentScope = getCurrentHub().getScope();

    expect(process.env.VERCEL).toBeUndefined();

    init({});

    // @ts-ignore need access to protected _tags attribute
    expect(currentScope._tags.vercel).toBeUndefined();
  });

  it('adds 404 transaction filter', async () => {
    init({
      dsn: 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012',
      tracesSampleRate: 1.0,
    });
    const hub = getCurrentHub();
    const sendEvent = jest.spyOn(hub.getClient()!.getTransport!(), 'sendEvent');

    const transaction = hub.startTransaction({ name: '/404' });
    transaction.finish();

    // We need to flush because the event processor pipeline is async whereas transaction.finish() is sync.
    await SentryNode.flush();

    expect(sendEvent).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(new SentryError('An event processor returned null, will not send event.'));
  });

  it("initializes both global hub and domain hub when there's an active domain", () => {
    const globalHub = getCurrentHub();
    const local = domain.create();
    local.run(() => {
      const domainHub = getCurrentHub();

      // they are in fact two different hubs, and neither one yet has a client
      expect(domainHub).not.toBe(globalHub);
      expect(globalHub.getClient()).toBeUndefined();
      expect(domainHub.getClient()).toBeUndefined();

      // this tag should end up only in the domain hub
      domainHub.setTag('dogs', 'areGreat');

      init({});

      expect(globalHub.getClient()).toEqual(expect.any(NodeClient));
      expect(domainHub.getClient()).toBe(globalHub.getClient());
      // @ts-ignore need access to protected _tags attribute
      expect(globalHub.getScope()._tags).toEqual({ runtime: 'node' });
      // @ts-ignore need access to protected _tags attribute
      expect(domainHub.getScope()._tags).toEqual({ runtime: 'node', dogs: 'areGreat' });
    });
  });

  describe('integrations', () => {
    it('adds RewriteFrames integration by default', () => {
      init({});

      const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
      expect(nodeInitOptions.integrations).toHaveLength(1);
      const integrations = nodeInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(RewriteFrames));
    });

    it('adds Http integration by default if tracesSampleRate is set', () => {
      init({ tracesSampleRate: 1.0 });

      const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
      expect(nodeInitOptions.integrations).toHaveLength(2);
      const integrations = nodeInitOptions.integrations as Integration[];
      expect(integrations[1]).toEqual(expect.any(Integrations.Http));
    });

    it('adds Http integration by default if tracesSampler is set', () => {
      init({ tracesSampler: () => true });

      const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
      expect(nodeInitOptions.integrations).toHaveLength(2);
      const integrations = nodeInitOptions.integrations as Integration[];
      expect(integrations[1]).toEqual(expect.any(Integrations.Http));
    });

    it('adds Http integration with tracing true', () => {
      init({ tracesSampleRate: 1.0 });
      const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
      expect(nodeInitOptions.integrations).toHaveLength(2);

      const integrations = nodeInitOptions.integrations as Integration[];
      expect((integrations[1] as any)._tracing).toBe(true);
    });

    it('supports passing integration through options', () => {
      init({ tracesSampleRate: 1.0, integrations: [new Integrations.Console()] });
      const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
      expect(nodeInitOptions.integrations).toHaveLength(3);

      const integrations = nodeInitOptions.integrations as Integration[];
      expect(integrations).toEqual([
        expect.any(Integrations.Console),
        expect.any(RewriteFrames),
        expect.any(Integrations.Http),
      ]);
    });

    describe('custom Http integration', () => {
      it('sets tracing to true if tracesSampleRate is set', () => {
        init({
          tracesSampleRate: 1.0,
          integrations: [new Integrations.Http({ tracing: false })],
        });

        const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
        expect(nodeInitOptions.integrations).toHaveLength(2);
        const integrations = nodeInitOptions.integrations as Integration[];
        expect(integrations[0] as InstanceType<typeof Integrations.Http>).toEqual(
          expect.objectContaining({ _breadcrumbs: true, _tracing: true, name: 'Http' }),
        );
      });

      it('sets tracing to true if tracesSampler is set', () => {
        init({
          tracesSampler: () => true,
          integrations: [new Integrations.Http({ tracing: false })],
        });

        const nodeInitOptions: NextjsOptions = nodeInit.mock.calls[0][0]!;
        expect(nodeInitOptions.integrations).toHaveLength(2);
        const integrations = nodeInitOptions.integrations as Integration[];
        expect(integrations[0] as InstanceType<typeof Integrations.Http>).toEqual(
          expect.objectContaining({ _breadcrumbs: true, _tracing: true, name: 'Http' }),
        );
      });
    });
  });
});
