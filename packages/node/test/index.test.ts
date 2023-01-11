import { getMainCarrier, initAndBind, SDK_VERSION } from '@sentry/core';
import type { EventHint, Integration } from '@sentry/types';
import * as domain from 'domain';

import type { Event, Scope } from '../src';
import {
  addBreadcrumb,
  captureEvent,
  captureException,
  captureMessage,
  configureScope,
  getCurrentHub,
  init,
  NodeClient,
} from '../src';
import { ContextLines, LinkedErrors } from '../src/integrations';
import { defaultStackParser } from '../src/sdk';
import type { NodeClientOptions } from '../src/types';
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
  beforeAll(() => {
    init({ dsn });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentHub().pushScope();
  });

  afterEach(() => {
    getCurrentHub().popScope();
  });

  describe('getContext() / setContext()', () => {
    test('store/load extra', async () => {
      configureScope((scope: Scope) => {
        scope.setExtra('abc', { def: [1] });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._extra).toEqual({
        abc: { def: [1] },
      });
    });

    test('store/load tags', async () => {
      configureScope((scope: Scope) => {
        scope.setTag('abc', 'def');
      });
      expect(global.__SENTRY__.hub._stack[1].scope._tags).toEqual({
        abc: 'def',
      });
    });

    test('store/load user', async () => {
      configureScope((scope: Scope) => {
        scope.setUser({ id: 'def' });
      });
      expect(global.__SENTRY__.hub._stack[1].scope._user).toEqual({
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
      getCurrentHub().bindClient(client);
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
      getCurrentHub().bindClient(new NodeClient(options));
      configureScope((scope: Scope) => {
        scope.setTag('test', '1');
      });
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
      getCurrentHub().bindClient(new NodeClient(options));
      configureScope((scope: Scope) => {
        scope.setTag('test', '1');
      });
      try {
        throw 'test string exception';
      } catch (e) {
        captureException(e);
      }
    });

    test('capture an exception with pre/post context', done => {
      expect.assertions(10);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        beforeSend: (event: Event) => {
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
          done();
          return null;
        },
        dsn,
      });
      getCurrentHub().bindClient(new NodeClient(options));
      configureScope((scope: Scope) => {
        scope.setTag('test', '1');
      });
      try {
        throw new Error('test');
      } catch (e) {
        captureException(e);
      }
    });

    test('capture a linked exception with pre/post context', done => {
      expect.assertions(15);
      const options = getDefaultNodeClientOptions({
        stackParser: defaultStackParser,
        integrations: [new ContextLines(), new LinkedErrors()],
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
      getCurrentHub().bindClient(new NodeClient(options));
      try {
        throw new Error('test');
      } catch (e) {
        try {
          throw new Error('cause');
        } catch (c) {
          e.cause = c;
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
      getCurrentHub().bindClient(new NodeClient(options));
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
      getCurrentHub().bindClient(new NodeClient(options));
      captureEvent({ message: 'test event' });
    });

    test('capture an event in a domain', done => {
      const d = domain.create();

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
      const client = new NodeClient(options);

      d.run(() => {
        getCurrentHub().bindClient(client);
        expect(getCurrentHub().getClient()).toBe(client);
        getCurrentHub().captureEvent({ message: 'test domain' });
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
      getCurrentHub().bindClient(new NodeClient(options));
      try {
        // @ts-ignore allow function declarations in strict mode
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
  });

  test('global.SENTRY_RELEASE is used to set release on initialization if available', () => {
    global.SENTRY_RELEASE = { id: 'foobar' };
    init({ dsn });
    expect(global.__SENTRY__.hub._stack[0].client.getOptions().release).toEqual('foobar');
    // Unsure if this is needed under jest.
    global.SENTRY_RELEASE = undefined;
  });

  describe('SDK metadata', () => {
    it('should set SDK data when `Sentry.init()` is called', () => {
      init({ dsn });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (getCurrentHub().getClient() as any).getOptions()._metadata.sdk;

      expect(sdkData.name).toEqual('sentry.javascript.node');
      expect(sdkData.packages[0].name).toEqual('npm:@sentry/node');
      expect(sdkData.packages[0].version).toEqual(SDK_VERSION);
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

    // wrapper packages (like @sentry/serverless) set their SDK data in their `init` methods, which are
    // called before the client is instantiated, and we don't want to clobber that data
    it("shouldn't overwrite SDK data that's already there", () => {
      init({
        dsn,
        // this would normally be set by the wrapper SDK in init()
        _metadata: {
          sdk: {
            name: 'sentry.javascript.serverless',
            packages: [
              {
                name: 'npm:@sentry/serverless',
                version: SDK_VERSION,
              },
            ],
            version: SDK_VERSION,
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sdkData = (getCurrentHub().getClient() as any).getOptions()._metadata.sdk;

      expect(sdkData.name).toEqual('sentry.javascript.serverless');
      expect(sdkData.packages[0].name).toEqual('npm:@sentry/serverless');
      expect(sdkData.packages[0].version).toEqual(SDK_VERSION);
      expect(sdkData.version).toEqual(SDK_VERSION);
    });
  });

  describe('autoloaded integrations', () => {
    it('should attach single integration to default integrations', () => {
      withAutoloadedIntegrations([new MockIntegration('foo')], () => {
        init({
          defaultIntegrations: [new MockIntegration('bar')],
        });
        const integrations = (initAndBind as jest.Mock).mock.calls[0][1].defaultIntegrations;
        expect(integrations.map((i: { name: string }) => i.name)).toEqual(['bar', 'foo']);
      });
    });

    it('should attach multiple integrations to default integrations', () => {
      withAutoloadedIntegrations([new MockIntegration('foo'), new MockIntegration('bar')], () => {
        init({
          defaultIntegrations: [new MockIntegration('baz'), new MockIntegration('qux')],
        });
        const integrations = (initAndBind as jest.Mock).mock.calls[0][1].defaultIntegrations;
        expect(integrations.map((i: { name: string }) => i.name)).toEqual(['baz', 'qux', 'foo', 'bar']);
      });
    });

    it('should ignore autoloaded integrations when `defaultIntegrations` is `false`', () => {
      withAutoloadedIntegrations([new MockIntegration('foo')], () => {
        init({
          defaultIntegrations: false,
        });
        const integrations = (initAndBind as jest.Mock).mock.calls[0][1].defaultIntegrations;
        expect(integrations).toEqual([]);
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

  describe('instrumenter', () => {
    it('defaults to sentry instrumenter', () => {
      init({ dsn });

      const instrumenter = (getCurrentHub()?.getClient()?.getOptions() as NodeClientOptions).instrumenter;

      expect(instrumenter).toEqual('sentry');
    });

    it('allows to set instrumenter', () => {
      init({ dsn, instrumenter: 'otel' });

      const instrumenter = (getCurrentHub()?.getClient()?.getOptions() as NodeClientOptions).instrumenter;

      expect(instrumenter).toEqual('otel');
    });
  });
});
