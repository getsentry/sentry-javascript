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
    expect(sdk1._install).toHaveBeenCalled();
    expect(sdk2._install).toHaveBeenCalled();
  });
});
