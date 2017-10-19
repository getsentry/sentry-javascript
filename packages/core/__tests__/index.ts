/// <reference types="jest" />
import * as Sentry from '../index';
import {MockAdapter} from '../__mocks__/MockAdapter';

const dsn = 'https://username:password@domain/path';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Core', () => {
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

  test('throw error for Adapters with same rank', () => {
    let sentry = Sentry.create(dsn);
    expect(Sentry.getSharedClient()).toBe(sentry);
    sentry.use(MockAdapter);
    expect(() => sentry.use(MockAdapter)).toThrow();
  });

  test('call install on all Adapters', () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.use(MockAdapter, <MockAdapter.Options>{
      rank: 1001,
      testOption: true
    });
    let spy1 = jest.spyOn(sdk1, 'install');
    sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
  });

  test('call captureMessage on Adapter', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.use(MockAdapter);
    let spy1 = jest.spyOn(sdk1, 'captureMessage');
    let result = await sentry.captureMessage('+');
    expect(spy1).toBeCalledWith('+');
    expect(result.message).toEqual('+');
  });

  test('call captureMessage on all Adapters', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk = sentry.use(MockAdapter);
    let spy = jest.spyOn(sdk, 'captureMessage');
    let result = await sentry.captureMessage('heyho');
    expect(spy).toBeCalled();
    expect(result).toBeDefined();
    if (result) {
      expect(result.message).toBe('heyho');
    }
  });

  test('call send only on one Adapter', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk = sentry.use(MockAdapter);
    let spy = jest.spyOn(sdk, 'captureMessage');
    let spySend = jest.spyOn(sdk, 'send');
    let result = await sentry.captureMessage('+');
    expect(spy).toBeCalled();
    expect(spySend).toBeCalled();
    expect(result).toBeDefined();
    if (result) {
      expect(result.message).toBe('+');
    }
  });
});
