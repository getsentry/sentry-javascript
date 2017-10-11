import * as Sentry from '../index';

export type Options = Sentry.Sdk.Options & {
  testOption?: boolean;
};

export class MockSdk implements Sentry.Sdk.Interface {
  private core: Sentry.Core;
  options: Options = {
    rank: 1000,
    testOption: false
  };

  constructor(public dsn: string, options: Options, core: Sentry.Core) {
    this.core = core;
    if (options && options.rank) this.options.rank = options.rank;
    return this;
  }

  install() {
    return Promise.resolve({
      sdk: this,
      value: true
    });
  }

  captureEvent(event: Sentry.Event) {
    event = { ...event };
    event.message = event.message + '+';
    return Promise.resolve(event);
  }

  send(event: Sentry.Event) {
    return Promise.resolve({
      sdk: this,
      value: event
    });
  }
}
