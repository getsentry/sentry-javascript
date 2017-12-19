/// <reference types="jest" />
import { IMockAdapterOptions, MockAdapter } from '../__mocks__/MockAdapter';
import * as Sentry from '../index';

const dsn = 'https://username:password@domain/path';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Client', () => {
  test('get public/private DSN', () => {
    const sentry = new Sentry.Client('https://username:password@domain/path');
    expect(sentry.dsn.getDsn(false)).toBe('https://username@domain/path');
    expect(sentry.dsn.getDsn(true)).toBe('https://username:password@domain/path');
    const sentry2 = new Sentry.Client('https://username:password@domain:8888/path');
    expect(sentry2.dsn.getDsn(false)).toBe('https://username@domain:8888/path');
    expect(sentry2.dsn.getDsn(true)).toBe('https://username:password@domain:8888/path');
  });

  /* tslint:disable */
  test('invalid DSN', () => {
    expect(() => {
      new Sentry.Client('abc');
    }).toThrow();
    expect(() => {
      new Sentry.Client('https://username:password@domain');
    }).toThrow();
    expect(() => {
      new Sentry.Client('//username:password@domain');
    }).toThrow();
    expect(() => {
      new Sentry.Client('https://username:@domain');
    }).toThrow();
    expect(() => {
      new Sentry.Client('123');
    }).toThrow();
    try {
      new Sentry.Client('123');
    } catch (e) {
      expect(e instanceof Sentry.SentryError).toBeTruthy();
    }
  });
  /* tslint:enable */

  test('throw error if multiple Adapters', () => {
    const sentry = Sentry.create(dsn);
    expect(Sentry.getSharedClient()).toBe(sentry);
    sentry.use(MockAdapter);
    expect(() => sentry.use(MockAdapter)).toThrow();
  });

  test('call install on Adapter', async () => {
    expect.assertions(2);
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = jest.spyOn(sentry, 'install');
    const spy2 = jest.spyOn(sentry.getAdapter(), 'install');
    await sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  test('multiple install calls on Adapter should only call once', async () => {
    expect.assertions(1);
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = jest.spyOn(sentry.getAdapter(), 'install');
    await sentry.install();
    await sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  test('no registered Adapter', async () => {
    expect.assertions(1);
    const sentry = new Sentry.Client(dsn);
    try {
      await sentry.install();
    } catch (e) {
      expect(e.message).toBe('No adapter in use, please call .use(<Adapter>)');
    }
  });

  test('get Adapter', () => {
    const sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    expect(sentry.getAdapter()).toBeInstanceOf(MockAdapter);
  });

  test('call captureMessage with reject on Adapter', async () => {
    expect.assertions(1);
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    try {
      await sentry.captureMessage('fail');
    } catch (e) {
      expect(e.message).toBe('Failed because we told it too');
    }
  });

  test('call captureMessage on Adapter', async () => {
    expect.assertions(4);
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    sentry.install();
    const spy = jest.spyOn(sentry, 'captureMessage');
    const spy2 = jest.spyOn(sentry.getAdapter(), 'captureMessage');
    const result = await sentry.captureMessage('heyho');
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
    expect(result).toBeDefined();
    if (result) {
      expect(result.message).toBe('heyho');
    }
  });

  test('call captureBreadcrumb on Adapter', async () => {
    expect.assertions(2);
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    await sentry.install();
    const spy = jest.spyOn(sentry, 'captureBreadcrumb');
    const spy2 = jest.spyOn(sentry.getAdapter(), 'captureBreadcrumb');
    await sentry.captureBreadcrumb({ category: 'test' });
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
  });

  test('call captureException on Adapter', async () => {
    expect.assertions(2);
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy = jest.spyOn(sentry, 'captureException');
    const spy2 = jest.spyOn(sentry.getAdapter(), 'captureException');
    await sentry.captureException(new Error('oops'));
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
  });

  test('call send only on one Adapter', async () => {
    expect.assertions(6);
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy = jest.spyOn(sentry, 'captureMessage');
    const spy2 = jest.spyOn(sentry.getAdapter(), 'captureMessage');
    const spySend = jest.spyOn(sentry, 'send');
    const spySend2 = jest.spyOn(sentry.getAdapter(), 'send');
    const result = await sentry.captureMessage('+');
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
    expect(spySend).toBeCalled();
    expect(spySend2).toBeCalled();
    expect(result).toBeDefined();
    if (result) {
      expect(result.message).toBe('+');
    }
  });

  test('call log only if bigger debug', () => {
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    const spy = jest.spyOn(global.console, 'log');
    sentry.log('Nothing');
    expect(spy).not.toBeCalled();
    sentry.options.logLevel = Sentry.LogLevel.Debug;
    sentry.log('This is fine');
    expect(spy).toBeCalled();
  });

  test('should throw error without calling install', async () => {
    expect.assertions(1);
    const sentry = new Sentry.Client(dsn).use(MockAdapter);
    return expect(sentry.captureException(new Error('oops'))).rejects.toEqual({
      message: 'Please call install() before calling other methods on Sentry',
      name: 'SentryError',
    });
  });

  test('call setRelease on Adapter', async () => {
    expect.assertions(1);
    const sentry = await new Sentry.Client(dsn).use(MockAdapter).install();
    const spy = jest.spyOn(sentry.getAdapter(), 'setRelease');
    await sentry.setRelease('#oops');
    expect(spy).toBeCalled();
  });
});
