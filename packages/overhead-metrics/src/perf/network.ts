import type * as playwright from 'playwright';

export class NetworkEvent {
  public constructor(
    public url: string | undefined,
    public requestSize: number | undefined,
    public responseSize: number | undefined,
    public requestTimeNs: bigint | undefined,
    public responseTimeNs: bigint | undefined,
  ) {}

  /**
   *
   */
  public static fromJSON(data: Partial<NetworkEvent>): NetworkEvent {
    return new NetworkEvent(
      data.url as string,
      data.requestSize as number,
      data.responseSize as number,
      data.requestTimeNs === undefined ? undefined : BigInt(data.requestTimeNs),
      data.responseTimeNs === undefined ? undefined : BigInt(data.responseTimeNs),
    );
  }
}

export type NetworkUsageSerialized = Partial<{ events: Array<NetworkEvent> }>;

export class NetworkUsage {
  public constructor(public events: Array<NetworkEvent>) {}

  /**
   *
   */
  public static fromJSON(data: NetworkUsageSerialized): NetworkUsage {
    return new NetworkUsage(data.events?.map(e => NetworkEvent.fromJSON(e)) || []);
  }
}

export class NetworkUsageCollector {
  private _events = new Array<NetworkEvent>();

  /**
   *
   */
  public static async create(page: playwright.Page): Promise<NetworkUsageCollector> {
    const self = new NetworkUsageCollector();
    await page.route(_ => true, self._captureRequest.bind(self));
    return self;
  }

  /**
   *
   */
  public getData(): NetworkUsage {
    return new NetworkUsage(this._events);
  }

  /**
   *
   */
  private async _captureRequest(route: playwright.Route, request: playwright.Request): Promise<void> {
    const url = request.url();
    try {
      const event = new NetworkEvent(
        url,
        request.postDataBuffer()?.length,
        undefined,
        process.hrtime.bigint(),
        undefined,
      );
      this._events.push(event);
      // Note: playwright would error out on file:/// requests. They are used to access local test app resources.
      if (url.startsWith('file:///')) {
        void route.continue();
      } else {
        const response = await route.fetch();
        const body = await response.body();
        void route.fulfill({ response, body });
        event.responseTimeNs = process.hrtime.bigint();
        event.responseSize = body.length;
      }
    } catch (e) {
      console.log(`Error when capturing request: ${request.method()} ${url} - ${e}`);
    }
  }
}
