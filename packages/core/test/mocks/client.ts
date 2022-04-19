import { Session } from '@sentry/hub';
import { ClientOptions, Event, Integration, Severity, SeverityLevel, Transport } from '@sentry/types';
import { resolvedSyncPromise } from '@sentry/utils';

import { BaseClient } from '../../src/baseclient';
import { initAndBind } from '../../src/sdk';
import { NewTransport } from '../../src/transports/base';
import { NoopTransport } from '../../src/transports/noop';

export function getDefaultTestClientOptions(options: Partial<TestClientOptions> = {}): TestClientOptions {
  return {
    integrations: [],
    transport: NoopTransport,
    stackParser: () => [],
    ...options,
  };
}

export interface TestClientOptions extends ClientOptions {
  test?: boolean;
  mockInstallFailure?: boolean;
  enableSend?: boolean;
  defaultIntegrations?: Integration[] | false;
}

export class TestClient extends BaseClient<TestClientOptions> {
  public static instance?: TestClient;
  public static sendEventCalled?: (event: Event) => void;

  public event?: Event;
  public session?: Session;

  public constructor(options: TestClientOptions, transport: Transport, newTransport?: NewTransport) {
    super(options, transport, newTransport);
    TestClient.instance = this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public eventFromException(exception: any): PromiseLike<Event> {
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

  public eventFromMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel = 'info',
  ): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
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
}

export function init(options: TestClientOptions, transport: Transport, newTransport?: NewTransport): void {
  initAndBind(TestClient, options, transport, newTransport);
}

export function setupTestTransport(options: TestClientOptions): { transport: Transport; newTransport?: NewTransport } {
  const noop = { transport: new NoopTransport() };

  if (!options.dsn) {
    // We return the noop transport here in case there is no Dsn.
    return noop;
  }

  const transportOptions = options.transportOptions ? options.transportOptions : { dsn: options.dsn };

  if (options.transport) {
    return { transport: new options.transport(transportOptions) };
  }

  return noop;
}
