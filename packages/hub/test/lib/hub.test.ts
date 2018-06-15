import { Breadcrumb, SentryEvent } from '@sentry/types';
import { Hub, Layer, Scope } from '../../src';

const clientFn = jest.fn();
// const asyncClientFn = jest.fn(async () => Promise.resolve({}));
// const asyncClientFn = async () => jest.fn();
const asyncClientFn = async () => Promise.reject('error');
const scope = new Scope();

const filledLayer: Layer = {
  client: {
    asyncClientFn,
    clientFn,
  },
  scope,
  type: 'local',
};

describe('Hub', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('push process into stack', () => {
    const hub = new Hub();
    expect(hub.getStack()).toHaveLength(1);
  });

  test('pass in filled layer', () => {
    const hub = new Hub([filledLayer]);
    expect(hub.getStack()).toHaveLength(1);
  });

  test('invoke client sync', () => {
    const hub = new Hub([filledLayer]);
    hub._invokeClient('clientFn', true);
    expect(clientFn).toHaveBeenCalled();
    expect(clientFn.mock.calls[0][0]).toBe(true);
    expect(clientFn.mock.calls[0][1]).toBe(scope);
  });

  test("don't invoke client sync with wrong func", () => {
    const hub = new Hub([filledLayer]);
    hub._invokeClient('funca', true);
    expect(clientFn).not.toHaveBeenCalled();
  });

  test('invoke client async catch error in case', done => {
    // @ts-ignore
    global.console = { error: jest.fn() };
    const hub = new Hub([filledLayer]);
    (hub as any).invokeClientAsync('asyncClientFn', true);
    setTimeout(() => {
      // tslint:disable-next-line
      expect(console.error).toHaveBeenCalled();
      done();
    });
  });

  test('isOlderThan', () => {
    const hub = new Hub();
    expect(hub.isOlderThan(0)).toBeFalsy();
  });

  test('pushScope', () => {
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const hub = new Hub([
      {
        scope: localScope,
        type: 'local',
      },
    ]);
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[1].scope).not.toBe(localScope);
    expect((hub.getStack()[1].scope as Scope).getExtra()).toEqual({ a: 'b' });
  });

  test('pushScope inherit client', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub([
      {
        client: testClient,
        type: 'local',
      },
    ]);
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[1].client).toBe(testClient);
  });

  test('pushScope with client', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub([
      {
        client: testClient,
        type: 'local',
      },
    ]);
    const ndClient = { foo: 'bar' };
    hub.pushScope(ndClient);
    expect(hub.getStack()).toHaveLength(2);
    expect(hub.getStack()[0].client).toBe(testClient);
    expect(hub.getStack()[1].client).toBe(ndClient);
  });

  test('popScope', () => {
    const hub = new Hub();
    hub.pushScope();
    expect(hub.getStack()).toHaveLength(2);
    hub.popScope();
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope', () => {
    const hub = new Hub();
    hub.withScope(() => {
      expect(hub.getStack()).toHaveLength(2);
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('withScope with client', () => {
    const hub = new Hub();
    const testClient = { bla: 'a' };
    hub.withScope(() => {
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
    }, testClient);
    expect(hub.getStack()).toHaveLength(1);

    hub.withScope(testClient, () => {
      expect(hub.getStack()).toHaveLength(2);
      expect(hub.getStack()[1].client).toBe(testClient);
    });
    expect(hub.getStack()).toHaveLength(1);
  });

  test('getCurrentClient', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub([
      {
        client: testClient,
        type: 'local',
      },
    ]);
    expect(hub.getCurrentClient()).toBe(testClient);
  });

  test('getStack', () => {
    const testLayer: Layer[] = [
      {
        client: { a: 'b' },
        type: 'local',
      },
    ];
    const hub = new Hub(testLayer);
    expect(hub.getStack()).toBe(testLayer);
  });

  test('getStackTop', () => {
    const testClient = { bla: 'a' };
    const hub = new Hub();
    hub.pushScope();
    hub.pushScope(testClient);
    expect(hub.getStackTop().client).toEqual({ bla: 'a' });
  });

  test('createScope', () => {
    const hub = new Hub();
    expect(hub.createScope()).toEqual(new Scope());
  });

  test('createScope with parentScope', () => {
    const hub = new Hub();
    const parentScope = new Scope();
    parentScope.setExtra('a', 'b');
    expect(hub.createScope(parentScope).getExtra()).toEqual({ a: 'b' });
  });

  test('captureException', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClientAsync');
    hub.captureException('a');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureException');
    expect(spy.mock.calls[0][1]).toBe('a');
  });

  test('captureMessage', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClientAsync');
    hub.captureMessage('a');
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureMessage');
    expect(spy.mock.calls[0][1]).toBe('a');
  });

  test('captureEvent', () => {
    const event: SentryEvent = {
      extra: { b: 3 },
    };
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, 'invokeClientAsync');
    hub.captureEvent(event);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('captureEvent');
    expect(spy.mock.calls[0][1]).toBe(event);
  });

  test('addBreadcrumb', () => {
    const hub = new Hub();
    const spy = jest.spyOn(hub as any, '_invokeClient');
    hub.addBreadcrumb({ message: 'test' });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toBe('addBreadcrumb');
    expect(spy.mock.calls[0][1]).toEqual({ message: 'test' });
  });

  test('configureScope', () => {
    const hub = new Hub();
    hub.configureScope(_ => {
      expect(true).toBeFalsy();
    });
  });

  test('configureScope', () => {
    const localScope = new Scope();
    localScope.setExtra('a', 'b');
    const testLayer: Layer[] = [
      {
        client: { a: 'b' },
        scope: localScope,
        type: 'local',
      },
    ];
    const hub = new Hub(testLayer);
    hub.configureScope(confScope => {
      expect(confScope.getExtra()).toEqual({ a: 'b' });
    });
  });
});
