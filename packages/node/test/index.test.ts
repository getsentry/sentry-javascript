import {
  SDK_VERSION,
  getGlobalScope,
  getIsolationScope,
  getMainCarrier,
  initAndBind,
  setCurrentClient,
  withIsolationScope,
} from '@sentry/core';
import type { EventHint, Integration } from '@sentry/types';

import type { Event } from '../src';
import { contextLinesIntegration, linkedErrorsIntegration } from '../src';
import {
  NodeClient,
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  getClient,
  getCurrentHub,
  getCurrentScope,
  init,
} from '../src';
import { setNodeAsyncContextStrategy } from '../src/async';
import { defaultStackParser, getDefaultIntegrations } from '../src/sdk';
import { getDefaultNodeClientOptions } from './helper/node-client-options';

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    initAndBind: jest.fn().mockImplementation(original.initAndBind),
  };
});

const dsn = 'https://53039209a22b4ec1bcc296a3c9fdecd6@sentry.io/4291';

// eslint-disable-next-line no-var
declare var global: any;

describe('SentryNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);

    init({ dsn });
  });

  describe('getContext() / setContext()', () => {
    test('store/load extra', async () => {
      getCurrentScope().setExtra('abc', { def: [1] });

      expect(getCurrentScope().getScopeData().extra).toEqual({
        abc: { def: [1] },
      });
    });

    test('store/load tags', async () => {
      getCurrentScope().setTag('abc', 'def');
      expect(getCurrentScope().getScopeData().tags).toEqual({
        abc: 'def',
      });
    });

    test('store/load user', async () => {
      getCurrentScope().setUser({ id: 'def' });
      expect(getCurrentScope().getScopeData().user).toEqual({
        id: 'def',
      });
    });
  });

  describe('breadcrumbs', () => {
    let sendEventSpy: jest.SpyInstance<void, [Event, EventHint?]>;

    beforeEach(() => {
      sendEventSpy = jest
        .spyOn(NodeClient.prototype, 'sendEvent')
        .mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      sendEventSpy.mockRestore();
    });

    test('record auto breadcrumbs', done => {
      const options = getDefaultNodeClientOptions({
        beforeSend: (event: Event) => {
          // TODO: It should be 3, but we don't capture a breadcrumb
          // for our own captureMessage/captureException calls yet
          expect(event.breadcrumbs!).toHaveLength(2);
          done();
          return null;
        },
        dsn,
        stackParser: defaultStackParser,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      addBreadcrumb({ message: 'test1' });
      addBreadcrumb({ message: 'test2' });
      captureMessage('event');
    });
  });

  describe('capture', () => {
    let sendEventSpy: jest.SpyInstance<void, [Event, EventHint?]>;

    beforeEach(() => {
      sendEventSpy = jest
        .spyOn(NodeClient.prototype, 'sendEvent')
        .mockImplementation(async () => Promise.resolve({ code: 200 }));
    });

    afterEach(() => {
      sendEventSpy.mockRestore();
    });

    test('capture an exception', done => {
      expect.assertions(6);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(event.tags).toEqual({ test: '1' });
          expect(event.exception).not.toBeUndefined();
          expect(event.exception!.values![0]).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
          expect(event.exception!.values![0].value).toEqual('test');
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      getCurrentScope().setTag('test', '1');
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }
    });

    test('capture a string exception', done => {
      expect.assertions(6);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(event.tags).toEqual({ test: '1' });
          expect(event.exception).not.toBeUndefined();
          expect(event.exception!.values![0]).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!.frames![2]).not.toBeUndefined();
          expect(event.exception!.values![0].value).toEqual('test string exception');
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      getCurrentScope().setTag('test', '1');
      try {
        throw 'test string exception';
      } catch (e) {
        captureException(e);
      }
    });

    test('capture an exception with pre/post context', async () => {
      const beforeSend = jest.fn((event: Event) => {
        expect(event.tags).toEqual({ test: '1' });
        expect(event.exception).not.toBeUndefined();
        expect(event.exception!.values![0]).not.toBeUndefined();
        expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
        expect(event.exception!.values![0].stacktrace!.frames![1]).not.toBeUndefined();
        expect(event.exception!.values![0].stacktrace!.frames![1].pre_context).not.toBeUndefined();
        expect(event.exception!.values![0].stacktrace!.frames![1].post_context).not.toBeUndefined();
        expect(event.exception!.values![0].type).toBe('Error');
        expect(event.exception!.values![0].value).toBe('test');
        expect(event.exception!.values![0].stacktrace).toBeTruthy();
        return null;
      });

      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend,
        dsn,
        integrations: [contextLinesIntegration()],
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      getCurrentScope().setTag('test', '1');
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }

      await client.flush();

      expect(beforeSend).toHaveBeenCalledTimes(1);
    });

    test('capture a linked exception with pre/post context', done => {
      expect.assertions(15);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        integrations: [contextLinesIntegration(), linkedErrorsIntegration()],
        beforeSend: (event: Event) => {
          expect(event.exception).not.toBeUndefined();
          expect(event.exception!.values![1]).not.toBeUndefined();
          expect(event.exception!.values![1].stacktrace!).not.toBeUndefined();
          expect(event.exception!.values![1].stacktrace!.frames![1]).not.toBeUndefined();
          expect(event.exception!.values![1].stacktrace!.frames![1].pre_context).not.toBeUndefined();
          expect(event.exception!.values![1].stacktrace!.frames![1].post_context).not.toBeUndefined();
          expect(event.exception!.values![1].type).toBe('Error');
          expect(event.exception!.values![1].value).toBe('test');

          expect(event.exception!.values![0]).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!.frames![1]).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!.frames![1].pre_context).not.toBeUndefined();
          expect(event.exception!.values![0].stacktrace!.frames![1].post_context).not.toBeUndefined();
          expect(event.exception!.values![0].type).toBe('Error');
          expect(event.exception!.values![0].value).toBe('cause');
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      try {
        throw new Error('test');
      } catch (e) {
        try {
          throw new Error('cause');
        } catch (c) {
          (e as any).cause = c;
          captureException(e);
        }
      }
    });

    test('capture a message', done => {
      expect.assertions(2);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(event.message).toBe('test');
          expect(event.exception).toBeUndefined();
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      captureMessage('test');
    });

    test('capture an event', done => {
      expect.assertions(2);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(event.message).toBe('test event');
          expect(event.exception).toBeUndefined();
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      captureEvent({ message: 'test event' });
    });

    test('capture an event in a domain', done => {
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(event.message).toBe('test domain');
          expect(event.exception).toBeUndefined();
          done();
          return null;
        },
        dsn,
      });
      setNodeAsyncContextStrategy();
      const client = new NodeClient(options);

      withIsolationScope(() => {
        // eslint-disable-next-line deprecation/deprecation
        const hub = getCurrentHub();
        setCurrentClient(client);
        client.init();

        // eslint-disable-next-line deprecation/deprecation
        expect(getCurrentHub().getClient()).toBe(client);
        expect(getClient()).toBe(client);
        // eslint-disable-next-line deprecation/deprecation
        hub.captureEvent({ message: 'test domain' });
      });
    });

    test('stacktrace order', done => {
      expect.assertions(1);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
          expect(
            event.exception!.values![0].stacktrace!.frames![event.exception!.values![0].stacktrace!.frames!.length - 1]
              .function,
          ).toEqual('testy');
          done();
          return null;
        },
        dsn,
      });
      const client = new NodeClient(options);
      setCurrentClient(client);
      client.init();
      try {
        // eslint-disable-next-line no-inner-declarations
        function testy(): void {
          throw new Error('test');
        }
        testy();
      } catch (e) {
        captureException(e);
      }
    });
  });
});

function withAutoloadedIntegrations(integrations: Integration[], callback: () => void) {
  const carrier = getMainCarrier();
  carrier.__SENTRY__!.integrations = integrations;
  callback();
  carrier.__SENTRY__!.integrations = undefined;
  delete carrier.__SENTRY__!.integrations;
}

/** JSDoc */
class MockIntegration implements Integration {
  public name: string;

  public constructor(name: string) {
    this.name = name;
  }

  public setupOnce(): void {
    // noop
  }
}

describe('SentryNode initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getGlobalScope().clear();
    getIsolationScope().clear();
    getCurrentScope().clear();
    getCurrentScope().setClient(undefined);
  });

  test('global.SENTRY_RELEASE is used to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(getClient()?.getOptions().release).toEqual('foobar');
    // Unsure if this is needed under jest.
    global.SENTRY_RELEASE = undefined;
  });

  describe('SDK metadata', () => {
    it('should set SDK data when `Sentry.init()` is called', () => {
      init({ dsn });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.name).toEqual('sentry.javascript.node');
      expect(sdkData.packages?.[0].name).toEqual('npm:@sentry/node');
      expect(sdkData.packages?.[0].version).toEqual(SDK_VERSION);
      expect(sdkData.version).toEqual(SDK_VERSION);
    });

    it('should set SDK data when instantiating a client directly', () => {
      const options = getDefaultNodeClientOptions({ dsn });
      const client = new NodeClient(options);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (client as any).getOptions()._metadata.sdk;

      expect(sdkData.name).toEqual('sentry.javascript.node');
      expect(sdkData.packages[0].name).toEqual('npm:@sentry/node');
      expect(sdkData.packages[0].version).toEqual(SDK_VERSION);
      expect(sdkData.version).toEqual(SDK_VERSION);
    });

    // wrapper packages (like @sentry/aws-serverless) set their SDK data in their `init` methods, which are
    // called before the client is instantiated, and we don't want to clobber that data
    it("shouldn't overwrite SDK data that's already there", () => {
      init({
        dsn,
        // this would normally be set by the wrapper SDK in init()
        _metadata: {
          sdk: {
            name: 'sentry.javascript.aws-serverless',
            packages: [
              {
                name: 'npm:@sentry/aws-serverless',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
        },
      });

      const sdkData = getClient()?.getOptions()._metadata?.sdk || {};

      expect(sdkData.name).toEqual('sentry.javascript.aws-serverless');
      expect(sdkData.packages?.[0].name).toEqual('npm:@sentry/aws-serverless');
      expect(sdkData.packages?.[0].version).toEqual(SDK_VERSION);
      expect(sdkData.version).toEqual(SDK_VERSION);
    });
  });

  describe('autoloaded integrations', () => {
    it('should attach integrations to default integrations', () => {
      withAutoloadedIntegrations([new MockIntegration('foo')], () => {
        init({
          defaultIntegrations: [...getDefaultIntegrations({}), new MockIntegration('bar')],
        });
        const integrations = (initAndBind as jest.Mock).mock.calls[0][1].defaultIntegrations;
        expect(integrations.map((i: { name: string }) => i.name)).toEqual(expect.arrayContaining(['foo', 'bar']));
      });
    });

    it('should ignore autoloaded integrations when `defaultIntegrations` is `false`', () => {
      withAutoloadedIntegrations([new MockIntegration('foo')], () => {
        init({
          defaultIntegrations: false,
        });
        const integrations = (initAndBind as jest.Mock).mock.calls[0][1].defaultIntegrations;
        expect(integrations).toEqual(false);
      });
    });
  });

  describe('autoSessionTracking', () => {
    it('enables autoSessionTracking if there is a release', () => {
      init({
        dsn: '',
        release: '3.5.7',
      });

      const options = (initAndBind as jest.Mock).mock.calls[0][1];
      expect(options.autoSessionTracking).toBe(true);
    });

    it('disables autoSessionTracking if dsn is undefined', () => {
      init({
        release: '3.5.7',
      });

      const options = (initAndBind as jest.Mock).mock.calls[0][1];
      expect(options.autoSessionTracking).toBe(undefined);
    });
  });

  describe('propagation context', () => {
    beforeEach(() => {
      process.env.SENTRY_TRACE = '12312012123120121231201212312012-1121201211212012-0';
      process.env.SENTRY_BAGGAGE = 'sentry-release=1.0.0,sentry-environment=production';
    });

    afterEach(() => {
      delete process.env.SENTRY_TRACE;
      delete process.env.SENTRY_BAGGAGE;
    });

    it('reads from environmental variables', () => {
      init({ dsn });

      // @ts-expect-error accessing private method for test
      expect(getCurrentScope()._propagationContext).toEqual({
        traceId: '12312012123120121231201212312012',
        parentSpanId: '1121201211212012',
        spanId: expect.any(String),
        sampled: false,
        dsc: {
          release: '1.0.0',
          environment: 'production',
        },
      });
    });

    it.each(['false', 'False', 'FALSE', 'n', 'no', 'No', 'NO', 'off', 'Off', 'OFF', '0'])(
      'does not read from environmental variable if SENTRY_USE_ENVIRONMENT is set to %s',
      useEnvValue => {
        process.env.SENTRY_USE_ENVIRONMENT = useEnvValue;
        init({ dsn });

        // @ts-expect-error accessing private method for test
        expect(getCurrentScope()._propagationContext.traceId).not.toEqual('12312012123120121231201212312012');

        delete process.env.SENTRY_USE_ENVIRONMENT;
      },
    );
  });
});
