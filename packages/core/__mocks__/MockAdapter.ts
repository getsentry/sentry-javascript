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
    if (message == 'fail') {
      return Promise.reject(new Error('Failed because we told it too'));
    }
    return Promise.resolve(event);
  }

  captureBreadcrumb(crumb: Sentry.Breadcrumb): Promise<Sentry.Breadcrumb> {
    // Do nothing
    return Promise.resolve(crumb);
  }

  send(event: Sentry.Event): Promise<Sentry.Event> {
    return Promise.resolve(event);
  }

  setUserContext(user?: Sentry.User) {
    return this;
  }

  setTagsContext(tags?: {[key: string]: any}) {
    return this;
  }

  setExtraContext(extra?: {[key: string]: any}) {
    return this;
  }

  clearContext() {
    return this;
  }
}
