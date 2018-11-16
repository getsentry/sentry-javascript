import { SentryEvent, SentryResponse, Status } from '@sentry/types';
import { BaseBackend } from '../../src/basebackend';
import { Options } from '../../src/interfaces';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend extends BaseBackend<TestOptions> {
  public static instance?: TestBackend;

  public installed: number;
  public event?: SentryEvent;

  public constructor(protected readonly options: TestOptions) {
    super(options);
    TestBackend.instance = this;
    this.installed = 0;
  }

  public install(): boolean {
    this.installed += 1;
    return !this.options.mockInstallFailure;
  }

  public async eventFromException(exception: any): Promise<SentryEvent> {
    return {
      exception: {
        values: [
          {
            type: exception.name,
            value: exception.message,
          },
        ],
      }
    };
  }

  public async eventFromMessage(message: string): Promise<SentryEvent> {
    return { message };
  }

  public async sendEvent(event: SentryEvent): Promise<SentryResponse> {
    this.event = event;
    return { status: Status.Success };
  }
}
