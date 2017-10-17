/// <reference types="jest" />
import * as Sentry from '../index';
import { MockAdapter } from '../__mocks__/MockAdapter';

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
    // sentry = new Sentry.Client('https://username:password@domain');
    // expect(sentry).toThrow();
    // sentry = new Sentry.Client('//username:password@domain');
    // expect(sentry).toThrow();
    // expect(new Sentry.Client('abcd')).toThrow();
    // expect(new Sentry.Client('1234')).toThrow();
  });

  test('throw error for Adapters with same rank', () => {
    let sentry = new Sentry.Client(dsn);
    Sentry.setSharedClient(sentry);
    expect(Sentry.getSharedClient()).toBe(sentry);
    sentry.register(MockAdapter);
    expect(() => sentry.register(MockAdapter)).toThrow();
  });

  test('call install on all Adapters', () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.register(MockAdapter, <MockAdapter.Options>{
      rank: 1001,
      testOption: true
    });
    let sdk2 = sentry.register(MockAdapter, { rank: 1000 });
    let spy1 = jest.spyOn(sdk1, 'install');
    let spy2 = jest.spyOn(sdk2, 'install');
    sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  test('call captureEvent on all Adapters', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.register(MockAdapter);
    let sdk2 = sentry.register(MockAdapter, { rank: 1001 });
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let event = new Sentry.Event();
    event.id = 'testid';
    event.message = 'message';
    let result = await sentry.captureEvent(event);
    expect(spy1).toBeCalledWith({ id: 'testid', message: 'message', severity: 3 });
    expect(spy2).toBeCalledWith({ id: 'testid', message: 'message+', severity: 3 });
    expect(result.value).toEqual({ id: 'testid', message: 'message++', severity: 3 });
  });

  test('call captureEvent on all Adapters in right order', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.register(MockAdapter);
    let sdk2 = sentry.register(MockAdapter, { rank: 1001 });
    let sdk3 = sentry.register(MockAdapter, { rank: 999 });
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let spy3 = jest.spyOn(sdk3, 'captureEvent');
    let event = new Sentry.Event();
    event.id = 'testid';
    event.message = 'message';
    let result = await sentry.captureEvent(event);
    expect(spy1).toBeCalledWith({ id: 'testid', message: 'message+', severity: 3 });
    expect(spy2).toBeCalledWith({ id: 'testid', message: 'message++', severity: 3 });
    expect(spy3).toBeCalledWith({ id: 'testid', message: 'message', severity: 3 });
    expect(result.value).toEqual({ id: 'testid', message: 'message+++', severity: 3 });
  });

  test('call captureMessage on all Adapters', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.register(MockAdapter, { rank: 1001 });
    let sdk2 = sentry.register(MockAdapter, { rank: 1002 });
    let sdk3 = sentry.register(MockAdapter);
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let spy3 = jest.spyOn(sdk3, 'captureEvent');
    let result = await sentry.captureMessage('heyho');
    expect(spy1).toBeCalled();
    expect(spy2).toBeCalled();
    expect(spy3).toBeCalled();
    expect(result.value).toBeDefined();
    if (result.value) {
      expect(result.value.message).toBe('heyho+++');
    }
  });

  test('call send only on one SDK', async () => {
    let sentry = new Sentry.Client(dsn);
    let sdk1 = sentry.register(MockAdapter, { rank: 1001 });
    let sdk2 = sentry.register(MockAdapter, { rank: 900 });
    let sdk3 = sentry.register(MockAdapter);
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let spy3 = jest.spyOn(sdk3, 'captureEvent');
    let spy2Send = jest.spyOn(sdk2, 'send');
    let event = new Sentry.Event();
    event.id = 'testid';
    event.message = 'send';
    let result = await sentry.captureEvent(event);
    expect(spy1).toBeCalled();
    expect(spy2).toBeCalled();
    expect(spy3).toBeCalled();
    expect(spy2Send).toBeCalled();
    expect(result.adapter).toEqual(sdk2);
    expect(result.value).toBeDefined();
    if (result.value) {
      expect(result.value.message).toBe('send+++');
    }
  });
});
