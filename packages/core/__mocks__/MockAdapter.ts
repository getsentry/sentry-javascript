import * as Sentry from '../index';

export namespace MockAdapter {
  export type Options = Sentry.Adapter.Options & {
    testOption?: boolean;
  };
}

export class MockAdapter implements Sentry.Adapter {
  private core: Sentry.Client;
  options: MockAdapter.Options = {
    rank: 1000,
    testOption: false
  };

  constructor(core: Sentry.Client, options?: MockAdapter.Options) {
    this.core = core;
    if (options && options.rank) this.options.rank = options.rank;
    return this;
  }

  install(): Promise<Sentry.Adapter.Result<boolean>> {
    return Promise.resolve({
      adapter: this,
      value: true
    });
  }

  setOptions(options: MockAdapter.Options) {
    // We need nothing here
    return this;
  }
  captureException(exception: Error, event: Sentry.Event): Promise<Sentry.Event> {
    return Promise.resolve(event);
  }

  captureMessage(message: string, event: Sentry.Event): Promise<Sentry.Event> {
    event = {...event};
    event.message = event.message + message;
    return Promise.resolve(event);
  }

  send(event: Sentry.Event): Promise<Sentry.Adapter.Result<Sentry.Event>> {
    return Promise.resolve({
      adapter: this,
      value: event
    });
  }
}
