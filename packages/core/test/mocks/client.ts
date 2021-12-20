import { Options, EventHint, Event, Session, SeverityLevel, Transport } from '@sentry/types';

import { BaseClient } from '../../src/baseclient';
import { initAndBind } from '../../src/sdk';
import { resolvedSyncPromise } from '@sentry/utils';

interface TestOptions extends Options {
  test?: boolean;
  mockInstallFailure?: boolean;
  enableSend?: boolean;
}

export class TestClient extends BaseClient<TestOptions> {
  public static instance?: TestClient;
  public static sendEventCalled?: (event: Event) => void;

  public event?: Event;
  public session?: Session;

  public constructor(options: TestOptions) {
    super(options);
    TestClient.instance = this;
  }

  public sendEvent(event: Event): void {
    this.event = event;
    if (this._options.enableSend) {
      super.sendEvent(event);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    TestClient.sendEventCalled && TestClient.sendEventCalled(event);
  }

  public sendSession(session: Session): void {
    this.session = session;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  protected _eventFromException(exception: any, _hint?: EventHint): PromiseLike<Event> {
    return resolvedSyncPromise({
      exception: {
        values: [
          {
            /* eslint-disable @typescript-eslint/no-unsafe-member-access */
            type: exception.name,
            value: exception.message,
            /* eslint-enable @typescript-eslint/no-unsafe-member-access */
          },
        ],
      },
    });
  }

  protected _eventFromMessage(message: string, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }
}

export function init(options: TestOptions): void {
  initAndBind(TestClient, options);
}
