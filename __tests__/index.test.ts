import * as Sentry from '../index';
import { MockSdk } from '../__mocks__/MockSdk';

const dsn = '__DSN__';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('Sentry.Core', () => {
  test('call install on all SDKs', () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(MockSdk);
    let sdk2 = sentry.register(MockSdk);
    let spy1 = jest.spyOn(sdk1, 'install');
    let spy2 = jest.spyOn(sdk2, 'install');
    sentry.install();
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });

  test('call captureEvent on all SDKs', async () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(MockSdk);
    let sdk2 = sentry.register(MockSdk);
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let event = new Sentry.Event();
    event.id = 'testid';
    event.message = 'message';
    let result = await sentry.captureEvent(event);
    expect(spy1).toBeCalledWith({ id: 'testid', message: 'message', severity: 3 });
    expect(spy2).toBeCalledWith({ id: 'testid', message: 'message+', severity: 3 });
    expect(result).toEqual({ id: 'testid', message: 'message++', severity: 3 });
  });

  test('call captureMessage on all SDKs', async () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(MockSdk);
    let sdk2 = sentry.register(MockSdk);
    let sdk3 = sentry.register(MockSdk);
    let spy1 = jest.spyOn(sdk1, 'captureEvent');
    let spy2 = jest.spyOn(sdk2, 'captureEvent');
    let spy3 = jest.spyOn(sdk2, 'captureEvent');
    let result = await sentry.captureMessage('heyho');
    expect(spy1).toBeCalled();
    expect(spy2).toBeCalled();
    expect(spy3).toBeCalled();
    expect(result.message).toBe('heyho+++');
  });
});
