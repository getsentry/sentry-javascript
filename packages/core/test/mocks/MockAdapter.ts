// tslint:disable:prefer-function-over-method

import { Adapter, Client, Options } from '../../src/lib/client';
import { Breadcrumb, Context, SentryEvent } from '../../src/lib/domain';

const DEFAULT_OPTIONS = { testOption: false };

export interface MockOptions extends Options {
  testOption?: boolean;
}

export class MockAdapter implements Adapter {
  private context: Context = {};

  public constructor(
    _client: Client,
    public options: MockOptions = DEFAULT_OPTIONS,
  ) {}

  public async install(): Promise<boolean> {
    return true;
  }

  public async captureException(raw: any): Promise<SentryEvent> {
    return { message: String(raw) };
  }

  public async captureMessage(message: string): Promise<SentryEvent> {
    if (message === 'fail') {
      throw new Error('Failed because we told it to');
    } else {
      return { message };
    }
  }

  public async captureBreadcrumb(breadcrumb: Breadcrumb): Promise<Breadcrumb> {
    return breadcrumb;
  }

  public async send(_event: SentryEvent): Promise<void> {
    return;
  }

  public wrap(fn: () => void, _options: object): () => void {
    return fn;
  }

  public async setOptions(_options: MockOptions): Promise<void> {
    return;
  }

  public async getContext(): Promise<Context> {
    return this.context;
  }

  public async setContext(context: Context): Promise<void> {
    this.context = context;
  }
}
