import * as Sentry from '../index';

const Mock = jest.fn<Sentry.Sdk.Interface>(() => ({
  _send: jest.fn(),
  _install: jest.fn()
}));

const dsn = '__DSN__';

describe('Sentry.Core', () => {
  it('should call install on all SDKs', () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(Mock);
    let sdk2 = sentry.register(Mock);
    sentry.install();
    expect(sdk1._install).toBeCalled();
    expect(sdk2._install).toBeCalled();
    expect(sentry.getInstalledSdks().length).toBe(2);
  });

  it('should call send on all SDKs', () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(Mock);
    let sdk2 = sentry.register(Mock);
    sentry.send({ message: 'test' });
    expect(sdk1._send).toBeCalled();
    expect(sdk2._send).toBeCalled();
  });
});
