import {Adapter, Breadcrumb, Client, Event, Options} from '../src/index';

export interface MockAdapterOptions extends Options {
  testOption?: boolean;
}

export class MockAdapter implements Adapter {
  constructor(client: Client, public options: MockAdapterOptions = {testOption: false}) {
    return this;
  }

  public install(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public capture(event: Event) {
    return Promise.resolve({
      message: event.payload,
    });
  }

  public send(event: Event): Promise<Event> {
    return Promise.resolve(event);
  }

  public wrap(fn: Function, options: object) {
    return fn;
  }

  public async setOptions(options: MockAdapterOptions) {
    return Promise.resolve(this);
  }

  public async getContext() {
    return Promise.resolve({});
  }

  public async setContext() {
    return Promise.resolve(this);
  }
}
