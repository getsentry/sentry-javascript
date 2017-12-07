import * as Sentry from '../index';

export interface IMockAdapterOptions {
  testOption?: boolean;
}

export class MockAdapter implements Sentry.IAdapter {
  constructor(
    client: Sentry.Client,
    public options: IMockAdapterOptions = { testOption: false }
  ) {
    return this;
  }

  public install(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public setOptions(options: IMockAdapterOptions) {
    // We need nothing here
    return this;
  }

  public captureException(exception: Error): Promise<Sentry.Event> {
    return Promise.resolve(new Sentry.Event());
  }

  public async captureMessage(message: string): Promise<Sentry.Event> {
    const event = new Sentry.Event();
    event.message = message;
    if (message === 'fail') {
      throw new Error('Failed because we told it too');
    }
    return event;
  }

  public captureBreadcrumb(crumb: Sentry.IBreadcrumb): Promise<Sentry.IBreadcrumb> {
    // Do nothing
    return Promise.resolve(crumb);
  }

  public send(event: Sentry.Event): Promise<Sentry.Event> {
    return Promise.resolve(event);
  }

  public setUserContext(user?: Sentry.IUser) {
    return this;
  }

  public setTagsContext(tags?: { [key: string]: any }) {
    return this;
  }

  public setExtraContext(extra?: { [key: string]: any }) {
    return this;
  }

  public clearContext() {
    return this;
  }
}
