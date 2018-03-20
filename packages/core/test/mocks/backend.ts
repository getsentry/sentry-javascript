import { SentryEvent } from '../../src/lib/domain';
import { Backend, Frontend, Options } from '../../src/lib/interfaces';
import { Scope } from '../../src/lib/shim';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend implements Backend {
  public static instance?: TestBackend;

  public installed: number;
  public event?: SentryEvent;

  public constructor(private readonly frontend: Frontend<TestOptions>) {
    TestBackend.instance = this;
    this.installed = 0;
  }

  public async install(): Promise<boolean> {
    this.installed += 1;
    return !this.frontend.getOptions().mockInstallFailure;
  }

  public async eventFromException(
    exception: any,
    _: Scope,
  ): Promise<SentryEvent> {
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
}
