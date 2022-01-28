import { ChildProcess, spawn } from 'child_process';
import * as got from 'got';

import { downloadAndCacheBinary } from './download';
import { Envelope } from './types';

export * from './types';

interface Options {
  port?: number;
  debug?: boolean;
}

/** Spawns Relay and fetches events */
export class RelayTestServer {
  public events: Envelope[] = [];
  public errors: any[] = [];

  private _serverProcess: ChildProcess | undefined;
  private _timer: NodeJS.Timer | undefined;

  public constructor(private readonly _options: Options = {}) {}

  /** Starts the server */
  public async start(): Promise<void> {
    const stdio = this._options.debug ? 'inherit' : 'ignore';

    const binaryPath = process.env.RELAY_LOCAL_PATH || (await downloadAndCacheBinary());
    const args = ['run', '--mode', 'capture', '--port', String(this._options.port || 3000)];

    this._serverProcess = spawn(binaryPath, args, { shell: true, stdio });
    this._timer = global.setInterval(() => this._pollForEvents(), 100);

    // Wait for the server to start
    return new Promise(resolve => {
      setTimeout(resolve, 2000);
    });
  }

  /** Stops the server */
  public stop(): void {
    if (this._serverProcess) {
      this._serverProcess.kill();
    }

    if (this._timer) {
      global.clearInterval(this._timer);
    }
  }

  /** Clears events */
  public clearEvents(): void {
    this.events = [];
    this.errors = [];
  }

  /** Waits for a specific number of events to be received */
  public async waitForEvents(events: number, timeout: number = 8_000): Promise<void> {
    let remaining = timeout;
    while (this.events.length + this.errors.length < events) {
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      remaining -= 100;
      if (remaining < 0) {
        throw new Error('Timeout waiting for events');
      }
    }
  }

  /** Polls for events and adds them to events or errors */
  private _pollForEvents(): void {
    void this._getEvents().then(events => {
      events.forEach(event => {
        this.events.push(event);
      });
    });
  }

  /** Fetches available events */
  private async _getEvents(): Promise<Envelope[]> {
    const port = this._options.port || 3000;
    const events: any[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const { body } = await got.default.get<Envelope>(`http://localhost:${port}/api/relay/get-envelope/`, {
          responseType: 'json',
        });
        events.push(body);
      } catch (e) {
        if ((e as Error)?.message?.includes('404')) {
          break;
        }

        this.errors.push((e as Error)?.message);
        break;
      }
    }

    return events;
  }
}
