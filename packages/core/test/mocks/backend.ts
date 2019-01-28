import { SentryEvent } from '@sentry/types';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { BaseBackend } from '../../src/basebackend';
import { Options } from '../../src/interfaces';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend extends BaseBackend<TestOptions> {
  public static instance?: TestBackend;
  public static sendEventCalled?: (event: SentryEvent) => void;

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

  public eventFromException(exception: any): SyncPromise<SentryEvent> {
    return SyncPromise.resolve({
      exception: {
        values: [
          {
            type: exception.name,
            value: exception.message,
          },
        ],
      },
    });
  }

  public eventFromMessage(message: string): SyncPromise<SentryEvent> {
    return SyncPromise.resolve({ message });
  }

  public sendEvent(event: SentryEvent): void {
    this.event = event;
    // tslint:disable-next-line
    TestBackend.sendEventCalled && TestBackend.sendEventCalled(event);
  }
}
