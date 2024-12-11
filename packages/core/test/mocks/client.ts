import type {
  ClientOptions,
  Event,
  EventHint,
  Integration,
  Outcome,
  ParameterizedString,
  Session,
  SeverityLevel,
} from '../../src/types-hoist';

import { BaseClient } from '../../src/baseclient';
import { initAndBind } from '../../src/sdk';
import { createTransport } from '../../src/transports/base';
import { resolvedSyncPromise } from '../../src/utils-hoist/syncpromise';

export function getDefaultTestClientOptions(options: Partial<TestClientOptions> = {}): TestClientOptions {
  return {
    integrations: [],
    sendClientReports: true,
    transport: () =>
      createTransport(
        {
          recordDroppedEvent: () => undefined,
        }, // noop
        _ => resolvedSyncPromise({}),
      ),
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

  public constructor(options: TestClientOptions) {
    super(options);
    TestClient.instance = this;
  }

  public eventFromException(exception: any): PromiseLike<Event> {
    const event: Event = {
      exception: {
        values: [
          {
            type: exception.name,
            value: exception.message,
            /* eslint-enable @typescript-eslint/no-unsafe-member-access */
          },
        ],
      },
    };

    const frames = this._options.stackParser(exception.stack || '', 1);
    if (frames.length && event.exception?.values?.[0]) {
      event.exception.values[0] = { ...event.exception.values[0], stacktrace: { frames } };
    }

    return resolvedSyncPromise(event);
  }

  public eventFromMessage(message: ParameterizedString, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }

  public sendEvent(event: Event, hint?: EventHint): void {
    this.event = event;

    if (this._options.enableSend) {
      super.sendEvent(event, hint);
      return;
    }

    // In real life, this will get deleted as part of envelope creation.
    delete event.sdkProcessingMetadata;

    TestClient.sendEventCalled && TestClient.sendEventCalled(event);
  }

  public sendSession(session: Session): void {
    this.session = session;
  }

  // Public proxy for protected method
  public _clearOutcomes(): Outcome[] {
    return super._clearOutcomes();
  }
}

export function init(options: TestClientOptions): void {
  initAndBind(TestClient, options);
}
