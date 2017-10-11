import * as Sentry from '../index';

export namespace MockSdk {
  export type Options = Sentry.Sdk.Options & {
    testOption?: boolean;
  };

  export class Client implements Sentry.Sdk.Interface {
    private core: Sentry.Core;
    options: Options = {
      rank: 1000,
      testOption: false
    };

    constructor(core: Sentry.Core, public dsn: string, options?: Options) {
      this.core = core;
      if (options && options.rank) this.options.rank = options.rank;
      return this;
    }

    install(): Promise<Sentry.Sdk.Result<boolean>> {
      return Promise.resolve({
        sdk: this,
        value: true
      });
    }

    captureEvent(event: Sentry.Event): Promise<Sentry.Event> {
      event = { ...event };
      event.message = event.message + '+';
      return Promise.resolve(event);
    }

    send(event: Sentry.Event): Promise<Sentry.Sdk.Result<Sentry.Event>> {
      return Promise.resolve({
        sdk: this,
        value: event
      });
    }
  }
}
