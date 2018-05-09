import { Breadcrumb, Context, SentryEvent } from '@sentry/shim';
import { Backend, Client, Options, Scope } from '../../src/interfaces';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend implements Backend {
  public static instance?: TestBackend;

  public installed: number;
  public event?: SentryEvent;

  public constructor(private readonly client: Client<TestOptions>) {
    TestBackend.instance = this;
    this.installed = 0;
  }

  public install(): boolean {
    this.installed += 1;
    return !this.client.getOptions().mockInstallFailure;
  }

  public async eventFromException(exception: any): Promise<SentryEvent> {
    return {
      exception: [
        {
          type: 'Error',
          value: 'random error',
        },
      ],
      message: String(exception),
    };
  }

  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return { message };
  }

  public async sendEvent(event: SentryEvent): Promise<number> {
    this.event = event;
    return 200;
  }

  public storeBreadcrumb(
    _breadcrumb: Breadcrumb,
    _scope: Scope,
  ): boolean | Promise<boolean> {
    return true;
  }

  public storeContext(
    _context: Context,
    _scope: Scope,
  ): boolean | Promise<boolean> {
    return true;
  }
}
