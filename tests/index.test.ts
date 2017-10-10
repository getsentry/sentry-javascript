import * as Sentry from '../index';

const Mock = jest.fn<Sentry.Sdk.Interface>(() => ({
  _send: jest.fn(),
  _install: jest.fn()
}));

class MockSdk implements Sentry.Sdk.Interface {
  readonly dsn: string;
  readonly options: Sentry.Options = {};
  private core: Sentry.Core;

  constructor(dsn: string, options: Sentry.Options, core: Sentry.Core) {
    this.dsn = dsn;
    this.options = options;
    this.core = core;
    return this;
  }

  async _install(): Promise<Sentry.Sdk.Result<boolean>> {
    return Promise.resolve({
      sdk: this,
      value: true
    });
  }

  async _send(event: Sentry.Event) {
    return new Promise<Sentry.Sdk.Result<Sentry.Event>>((resolve, reject) => {
      resolve({
        sdk: this,
        value: event
      });
    });
  }
}

const dsn = '__DSN__';

describe('Sentry.Core', () => {
  it('should create an instance of Sdk.Interface', () => {
    let sentry = new Sentry.Core(dsn);
    let instance = sentry.register(MockSdk);
    expect(sentry.getInstances('MockSdk').length).toBe(1);
    expect(sentry.getInstances('JavaScript').length).toBe(0);
    expect(sentry.getInstances('MockSdk')[0]).toBeInstanceOf(MockSdk);
  });

  it('should call install on all SDKs', () => {
    let sentry = new Sentry.Core(dsn);
    let sdk1 = sentry.register(Mock);
    let sdk2 = sentry.register(Mock);
    sentry.install();
    expect(sdk1._install).toBeCalled();
    expect(sdk2._install).toBeCalled();
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
