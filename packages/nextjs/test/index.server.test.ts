import { RewriteFrames } from '@sentry/integrations';
import { Integrations } from '@sentry/node';
import { Integration } from '@sentry/types';

import { init, Scope } from '../src/index.server';
import { NextjsOptions } from '../src/utils/nextjsOptions';

const mockInit = jest.fn();
let configureScopeCallback: (scope: Scope) => void = () => undefined;

jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node');
  return {
    ...actual,
    init: (options: NextjsOptions) => {
      mockInit(options);
    },
    configureScope: (callback: (scope: Scope) => void) => {
      configureScopeCallback = callback;
    },
  };
});

describe('Server init()', () => {
  afterEach(() => {
    mockInit.mockClear();
    configureScopeCallback = () => undefined;
  });

  it('inits the Node SDK', () => {
    expect(mockInit).toHaveBeenCalledTimes(0);
    init({});
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenLastCalledWith({
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
    });
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

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);
      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(RewriteFrames));
    });

    it('adds Http integration by default if tracesSampleRate is set', () => {
      init({ tracesSampleRate: 1.0 });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(2);
      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[1]).toEqual(expect.any(Integrations.Http));
    });

    it('adds Http integration by default if tracesSampler is set', () => {
      init({ tracesSampler: () => true });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(2);
      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[1]).toEqual(expect.any(Integrations.Http));
    });

    it('adds Http integration with tracing true', () => {
      init({ tracesSampleRate: 1.0 });
      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(2);

      const integrations = reactInitOptions.integrations as Integration[];
      expect((integrations[1] as any)._tracing).toBe(true);
    });

    it('supports passing integration through options', () => {
      init({ tracesSampleRate: 1.0, integrations: [new Integrations.Console()] });
      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(3);

      const integrations = reactInitOptions.integrations as Integration[];
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

        const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
        expect(reactInitOptions.integrations).toHaveLength(2);
        const integrations = reactInitOptions.integrations as Integration[];
        expect(integrations[0] as InstanceType<typeof Integrations.Http>).toEqual(
          expect.objectContaining({ _breadcrumbs: true, _tracing: true, name: 'Http' }),
        );
      });

      it('sets tracing to true if tracesSampler is set', () => {
        init({
          tracesSampler: () => true,
          integrations: [new Integrations.Http({ tracing: false })],
        });

        const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
        expect(reactInitOptions.integrations).toHaveLength(2);
        const integrations = reactInitOptions.integrations as Integration[];
        expect(integrations[0] as InstanceType<typeof Integrations.Http>).toEqual(
          expect.objectContaining({ _breadcrumbs: true, _tracing: true, name: 'Http' }),
        );
      });
    });
  });
});
