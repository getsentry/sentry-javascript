/// <reference types="jest" />
import * as Sentry from '../index';
import {MockAdapter} from '../__mocks__/MockAdapter';

const dsn = 'https://username:password@domain/path';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Client', () => {
  test('get public/private DSN', () => {
    let sentry = new Sentry.Client('https://username:password@domain/path');
    expect(sentry.dsn.getDsn(false)).toBe('https://username@domain/path');
    expect(sentry.dsn.getDsn(true)).toBe('https://username:password@domain/path');
    let sentry2 = new Sentry.Client('https://username:password@domain:8888/path');
    expect(sentry2.dsn.getDsn(false)).toBe('https://username@domain:8888/path');
    expect(sentry2.dsn.getDsn(true)).toBe('https://username:password@domain:8888/path');
  });

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
      new Sentry.Client('123');
    }).toThrow();
    try {
      new Sentry.Client('123');
    } catch (e) {
      expect(e instanceof Sentry.SentryError).toBeTruthy();
    }
  });

  test('throw error if multiple Adapters', () => {
    let sentry = Sentry.create(dsn);
    expect(Sentry.getSharedClient()).toBe(sentry);
    sentry.use(MockAdapter);
    expect(() => sentry.use(MockAdapter)).toThrow();
  });

  test('call install on Adapter', () => {
    let sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, <MockAdapter.Options>{
      rank: 1001,
      testOption: true
    });
    let spy1 = jest.spyOn(sentry, 'install');
    let spy2 = jest.spyOn(sentry.getAdapter(), 'install');
    sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  test('no registered Adapter', () => {
    let sentry = new Sentry.Client(dsn);
    expect(() => sentry.install()).toThrow();
  });

  test('get Adapter', () => {
    let sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter, <MockAdapter.Options>{
      rank: 1001,
      testOption: true
    });
    expect(sentry.getAdapter()).toBeInstanceOf(MockAdapter);
  });

  test('call captureMessage with reject on Adapter', async () => {
    let sentry = new Sentry.Client(dsn);
    sentry.use(MockAdapter);
    expect.assertions(1);
    return expect(sentry.captureMessage('fail')).rejects.toEqual(
      new Error('Failed because we told it too')
    );
  });

  test('call captureMessage on Adapter', async () => {
    let sentry = new Sentry.Client(dsn).use(MockAdapter);
    let spy = jest.spyOn(sentry, 'captureMessage');
    let spy2 = jest.spyOn(sentry.getAdapter(), 'captureMessage');
    let result = await sentry.captureMessage('heyho');
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
    expect(result).toBeDefined();
    if (result) {
      expect(result.message).toBe('heyho');
    }
  });

  test('call captureBreadcrumb on Adapter', () => {
    let sentry = new Sentry.Client(dsn).use(MockAdapter);
    let spy = jest.spyOn(sentry, 'captureBreadcrumb');
    let spy2 = jest.spyOn(sentry.getAdapter(), 'captureBreadcrumb');
    sentry.captureBreadcrumb({category: 'test'});
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
  });

  test('call captureException on Adapter', () => {
    let sentry = new Sentry.Client(dsn).use(MockAdapter);
    let spy = jest.spyOn(sentry, 'captureException');
    let spy2 = jest.spyOn(sentry.getAdapter(), 'captureException');
    sentry.captureException(new Error('oops'));
    expect(spy).toBeCalled();
    expect(spy2).toBeCalled();
  });

  test('call send only on one Adapter', async () => {
    let sentry = new Sentry.Client(dsn).use(MockAdapter);
    let spy = jest.spyOn(sentry, 'captureMessage');
    let spy2 = jest.spyOn(sentry.getAdapter(), 'captureMessage');
    let spySend = jest.spyOn(sentry, 'send');
    let spySend2 = jest.spyOn(sentry.getAdapter(), 'send');
    let result = await sentry.captureMessage('+');
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
    let sentry = new Sentry.Client(dsn).use(MockAdapter);
    let spy = jest.spyOn(global.console, 'log');
    sentry.log('Nothing');
    expect(spy).not.toBeCalled();
    sentry.options.logLevel = Sentry.LogLevel.Debug;
    sentry.log('This is fine');
    expect(spy).toBeCalled();
  });
});
