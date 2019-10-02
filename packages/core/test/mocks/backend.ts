import { Event, Options, Transport } from '@sentry/types';
import { SyncPromise } from '@sentry/utils';

import { BaseBackend } from '../../src/basebackend';

export interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
  enableSend?: boolean;
}

export class TestBackend extends BaseBackend<TestOptions> {
  public static instance?: TestBackend;
  public static sendEventCalled?: (event: Event) => void;

  public event?: Event;

  public constructor(protected readonly _options: TestOptions) {
    super(_options);
    TestBackend.instance = this;
  }

  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const transportOptions = this._options.transportOptions
      ? this._options.transportOptions
      : { dsn: this._options.dsn };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }

    return super._setupTransport();
  }

  public eventFromException(exception: any): Promise<Event> {
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

  public eventFromMessage(message: string): Promise<Event> {
    return SyncPromise.resolve({ message });
  }

  public sendEvent(event: Event): void {
    this.event = event;
    if (this._options.enableSend) {
      super.sendEvent(event);
      return;
    }
    // tslint:disable-next-line
    TestBackend.sendEventCalled && TestBackend.sendEventCalled(event);
  }
}
