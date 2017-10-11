import * as Sentry from '../index';

export class MockSdk implements Sentry.Sdk.Interface {
  private core: Sentry.Core;

  constructor(public dsn: string, public options: Sentry.Options, core: Sentry.Core) {
    this.core = core;
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
