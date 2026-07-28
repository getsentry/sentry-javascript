import { trace, type Tracer } from '@opentelemetry/api';
import type { ClientOptions, Event, Options, SeverityLevel } from '@sentry/core';
import { Client, createTransport, getCurrentScope, resolvedSyncPromise, SDK_VERSION } from '@sentry/core';
import type { SentrySpanProcessor } from '../../src/spanProcessor';
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

export class TestClient extends Client<ClientOptions> {
  public traceProvider: BasicTracerProvider | undefined;
  public spanProcessor: SentrySpanProcessor | undefined;
  private _tracer: Tracer | undefined;

  public constructor(options: ClientOptions) {
    super(options);
  }

  /** Get the OTEL tracer. */
  public get tracer(): Tracer {
    if (this._tracer) {
      return this._tracer;
    }

    const name = '@sentry/opentelemetry';
    const version = SDK_VERSION;
    const tracer = (this.traceProvider || trace)?.getTracer(name, version);
    this._tracer = tracer;

    return tracer;
  }

  /**
   * @inheritDoc
   */
  public async flush(timeout?: number): Promise<boolean> {
    const provider = this.traceProvider;
    await provider?.forceFlush();
    return super.flush(timeout);
  }

  public eventFromException(exception: any): PromiseLike<Event> {
    return resolvedSyncPromise({
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

  public eventFromMessage(message: string, level: SeverityLevel = 'info'): PromiseLike<Event> {
    return resolvedSyncPromise({ message, level });
  }
}

export function init(options: Partial<Options> = {}): Client {
  const client = new TestClient(getDefaultTestClientOptions({ tracesSampleRate: 1, ...options }));

  // The client is on the current scope, from where it generally is inherited
  getCurrentScope().setClient(client);
  client.init();
  return client;
}

export function getDefaultTestClientOptions(options: Partial<Options> = {}): ClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  } as ClientOptions;
}
