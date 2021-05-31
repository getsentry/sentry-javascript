import { Integrations as TracingIntegrations } from '@sentry/tracing';
import { Integration } from '@sentry/types';

import { init, Integrations, nextRouterInstrumentation, Scope } from '../src/index.client';
import { NextjsOptions } from '../src/utils/nextjsOptions';

const { BrowserTracing } = TracingIntegrations;

const mockInit = jest.fn();
let configureScopeCallback: (scope: Scope) => void = () => undefined;

jest.mock('@sentry/react', () => {
  const actual = jest.requireActual('@sentry/react');
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

describe('Client init()', () => {
  afterEach(() => {
    mockInit.mockClear();
    configureScopeCallback = () => undefined;
  });

  it('inits the React SDK', () => {
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
      environment: 'test',
      integrations: undefined,
    });
  });

  it('sets runtime on scope', () => {
    const mockScope = new Scope();
    init({});
    configureScopeCallback(mockScope);
    // @ts-ignore need access to protected _tags attribute
    expect(mockScope._tags).toEqual({ runtime: 'browser' });
  });

  describe('integrations', () => {
    it('does not add BrowserTracing integration by default if tracesSampleRate is not set', () => {
      init({});

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toBeUndefined();
    });

    it('adds BrowserTracing integration by default if tracesSampleRate is set', () => {
      init({ tracesSampleRate: 1.0 });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(BrowserTracing));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options.routingInstrumentation).toEqual(
        nextRouterInstrumentation,
      );
    });

    it('adds BrowserTracing integration by default if tracesSampler is set', () => {
      init({ tracesSampler: () => true });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations[0]).toEqual(expect.any(BrowserTracing));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options.routingInstrumentation).toEqual(
        nextRouterInstrumentation,
      );
    });

    it('supports passing integration through options', () => {
      init({ tracesSampleRate: 1.0, integrations: [new Integrations.Breadcrumbs({ console: false })] });
      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(2);

      const integrations = reactInitOptions.integrations as Integration[];
      expect(integrations).toEqual([expect.any(Integrations.Breadcrumbs), expect.any(BrowserTracing)]);
    });

    it('uses custom BrowserTracing with array option with nextRouterInstrumentation', () => {
      init({
        tracesSampleRate: 1.0,
        integrations: [new BrowserTracing({ idleTimeout: 5000, startTransactionOnLocationChange: false })],
      });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      expect(reactInitOptions.integrations).toHaveLength(1);
      const integrations = reactInitOptions.integrations as Integration[];
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options).toEqual(
        expect.objectContaining({
          idleTimeout: 5000,
          startTransactionOnLocationChange: false,
          routingInstrumentation: nextRouterInstrumentation,
        }),
      );
    });

    it('uses custom BrowserTracing with function option with nextRouterInstrumentation', () => {
      init({
        tracesSampleRate: 1.0,
        integrations: () => [new BrowserTracing({ idleTimeout: 5000, startTransactionOnLocationChange: false })],
      });

      const reactInitOptions: NextjsOptions = mockInit.mock.calls[0][0];
      const integrationFunc = reactInitOptions.integrations as () => Integration[];
      const integrations = integrationFunc();
      expect((integrations[0] as InstanceType<typeof BrowserTracing>).options).toEqual(
        expect.objectContaining({
          idleTimeout: 5000,
          startTransactionOnLocationChange: false,
          routingInstrumentation: nextRouterInstrumentation,
        }),
      );
    });
  });
});
