import { RewriteFrames } from '@sentry/integrations';
import * as SentryNode from '@sentry/node';
import { Integration } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';

import { init, Scope } from '../src/index.server';
import { NextjsOptions } from '../src/utils/nextjsOptions';

const { Integrations } = SentryNode;

const global = getGlobalObject();

// normally this is set as part of the build process, so mock it here
(global as typeof global & { __rewriteFramesDistDir__: string }).__rewriteFramesDistDir__ = '.next';

let configureScopeCallback: (scope: Scope) => void = () => undefined;
jest.spyOn(SentryNode, 'configureScope').mockImplementation(callback => (configureScopeCallback = callback));
const nodeInit = jest.spyOn(SentryNode, 'init');

describe('Server init()', () => {
  afterEach(() => {
    nodeInit.mockClear();
    configureScopeCallback = () => undefined;
    global.__SENTRY__.hub = undefined;
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
            packages: expect.any(Array),
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
    const mockScope = new Scope();
    init({});
    configureScopeCallback(mockScope);
    // @ts-ignore need access to protected _tags attribute
    expect(mockScope._tags).toEqual({ runtime: 'node' });
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
