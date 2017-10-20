import * as Sentry from '../index';

export namespace MockAdapter {
  export type Options = Sentry.Adapter.Options & {
    testOption?: boolean;
  };
}

export class MockAdapter implements Sentry.Adapter {
  constructor(
    client: Sentry.Client,
    public options: MockAdapter.Options = {testOption: false}
  ) {
    return this;
  }

  install(): Promise<boolean> {
    return Promise.resolve(true);
  }

  setOptions(options: MockAdapter.Options) {
    // We need nothing here
    return this;
  }

  captureException(exception: Error): Promise<Sentry.Event> {
    return Promise.resolve(new Sentry.Event());
  }

  captureMessage(message: string): Promise<Sentry.Event> {
    let event = new Sentry.Event();
    event.message = message;
    return Promise.resolve(event);
  }

  captureBreadcrumb(crumb: Sentry.Breadcrumb): Promise<Sentry.Breadcrumb> {
    // Do nothing
    return Promise.resolve(crumb);
  }

  send(event: Sentry.Event): Promise<Sentry.Event> {
    return Promise.resolve(event);
  }
}
