import { Event, Options } from '@sentry/types';
import { SyncPromise } from '@sentry/utils/syncpromise';
import { BaseBackend } from '../../src/basebackend';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
}

export class TestBackend extends BaseBackend<TestOptions> {
  public static instance?: TestBackend;
  public static sendEventCalled?: (event: Event) => void;

  public event?: Event;

  public constructor(protected readonly options: TestOptions) {
    super(options);
    TestBackend.instance = this;
  }

  public eventFromException(exception: any): SyncPromise<Event> {
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

  public eventFromMessage(message: string): SyncPromise<Event> {
    return SyncPromise.resolve({ message });
  }

  public sendEvent(event: Event): void {
    this.event = event;
    // tslint:disable-next-line
    TestBackend.sendEventCalled && TestBackend.sendEventCalled(event);
  }
}
