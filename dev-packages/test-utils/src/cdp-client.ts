import { WebSocket } from 'ws';

/**
 * Configuration options for the CDP client.
 */
export interface CDPClientOptions {
  /**
   * WebSocket URL to connect to (e.g., 'ws://127.0.0.1:9229/ws').
   * Can also use the format 'ws://host:port' without path for standard V8 inspector.
   */
  url: string;

  /**
   * Number of connection retry attempts before giving up.
   * @default 5
   */
  retries?: number;

  /**
   * Delay in milliseconds between retry attempts.
   * @default 1000
   */
  retryDelayMs?: number;

  /**
   * Connection timeout in milliseconds.
   * @default 10000
   */
  connectionTimeoutMs?: number;

  /**
   * Default timeout for CDP method calls in milliseconds.
   * @default 30000
   */
  defaultTimeoutMs?: number;

  /**
   * Whether to log debug messages.
   * @default false
   */
  debug?: boolean;
}

/**
 * Response type for CDP heap usage queries.
 */
export interface HeapUsage {
  usedSize: number;
  totalSize: number;
}

interface CDPResponse {
  id?: number;
  method?: string;
  error?: { message: string };
  result?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type EventHandler = (params: Record<string, unknown>) => void;

/**
 * Low-level CDP client for connecting to V8 inspector endpoints.
 *
 * For memory profiling, prefer using `MemoryProfiler` which provides a higher-level API.
 *
 * @example
 * ```typescript
 * const cdp = new CDPClient({ url: 'ws://127.0.0.1:9229/ws' });
 * await cdp.connect();
 * await cdp.send('Runtime.enable');
 * await cdp.close();
 * ```
 */
export class CDPClient {
  private _ws: WebSocket | null;
  private _messageId: number;
  private _pendingRequests: Map<number, PendingRequest>;
  private _eventHandlers: Map<string, EventHandler[]>;
  private _connected: boolean;
  private readonly _options: Required<CDPClientOptions>;

  public constructor(options: CDPClientOptions) {
    this._ws = null;
    this._messageId = 0;
    this._pendingRequests = new Map();
    this._eventHandlers = new Map();
    this._connected = false;
    this._options = {
      retries: 5,
      retryDelayMs: 1000,
      connectionTimeoutMs: 10000,
      defaultTimeoutMs: 30000,
      debug: false,
      ...options,
    };
  }

  /**
   * Connect to the V8 inspector WebSocket endpoint.
   * Will retry according to the configured retry settings.
   */
  public async connect(): Promise<void> {
    const { retries, retryDelayMs } = this._options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this._tryConnect();
        return;
      } catch (err) {
        this._log(`Connection attempt ${attempt}/${retries} failed:`, (err as Error).message);
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
          throw err;
        }
      }
    }
  }

  /**
   * Send a CDP method call and wait for the response.
   *
   * @param method - The CDP method name (e.g., 'HeapProfiler.enable')
   * @param params - Optional parameters for the method
   * @param timeoutMs - Timeout in milliseconds (defaults to configured defaultTimeoutMs)
   * @returns The result from the CDP method
   */
  public async send<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const timeout = timeoutMs ?? this._options.defaultTimeoutMs;
    const id = ++this._messageId;
    const message = JSON.stringify({ id, method, params });

    this._log('Sending:', method, params || '');

    return new Promise((resolve, reject) => {
      this._pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this._ws!.send(message);

      setTimeout(() => {
        if (this._pendingRequests.has(id)) {
          this._pendingRequests.delete(id);
          reject(new Error(`CDP request ${method} timed out after ${timeout}ms`));
        }
      }, timeout);
    });
  }

  /**
   * Send a CDP method call without waiting for a response.
   * Useful for commands that may not return responses in certain V8 environments.
   *
   * @param method - The CDP method name
   * @param params - Optional parameters for the method
   * @param settleDelayMs - Time to wait after sending (default: 100ms)
   */
  public async sendFireAndForget(method: string, params?: Record<string, unknown>, settleDelayMs = 100): Promise<void> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = ++this._messageId;
    const message = JSON.stringify({ id, method, params });

    this._log('Sending (fire-and-forget):', method, params || '');

    this._ws.send(message);

    // Give the command time to execute
    await new Promise(resolve => setTimeout(resolve, settleDelayMs));
  }

  /**
   * Check if the client is currently connected.
   */
  public isConnected(): boolean {
    return this._connected && this._ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Register an event handler for CDP events.
   *
   * @param eventName - The CDP event name (e.g., 'HeapProfiler.addHeapSnapshotChunk')
   * @param handler - The callback function to handle the event
   */
  public on(eventName: string, handler: EventHandler): void {
    const handlers = this._eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this._eventHandlers.set(eventName, handlers);
  }

  /**
   * Remove an event handler for CDP events.
   *
   * @param eventName - The CDP event name
   * @param handler - The handler to remove
   */
  public off(eventName: string, handler: EventHandler): void {
    const handlers = this._eventHandlers.get(eventName);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Close the WebSocket connection.
   */
  public async close(): Promise<void> {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
      this._connected = false;
    }
  }

  private _log(...args: unknown[]): void {
    if (this._options.debug) {
      // eslint-disable-next-line no-console
      console.log('[CDPClient]', ...args);
    }
  }

  private async _tryConnect(): Promise<void> {
    const { url, connectionTimeoutMs } = this._options;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection to ${url} timed out after ${connectionTimeoutMs}ms`));
      }, connectionTimeoutMs);

      this._ws = new WebSocket(url);

      this._ws.on('open', () => {
        clearTimeout(timeoutId);
        this._connected = true;
        this._log('WebSocket connected to', url);
        resolve();
      });

      this._ws.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to connect to inspector at ${url}: ${err.message}`));
      });

      this._ws.on('close', () => {
        this._connected = false;
      });

      this._ws.on('message', (data: Buffer) => {
        try {
          const rawMessage = data.toString();
          this._log('Received raw message:', rawMessage.slice(0, 500));

          const message = JSON.parse(rawMessage) as CDPResponse;

          // CDP event (not a response to our request)
          if (message.method) {
            this._log('CDP event:', message.method);
            const handlers = this._eventHandlers.get(message.method);
            if (handlers) {
              const params = (message as unknown as { params?: Record<string, unknown> }).params || {};
              for (const handler of handlers) {
                handler(params);
              }
            }
            return;
          }

          if (message.id !== undefined) {
            this._log(
              'CDP response for id:',
              message.id,
              'error:',
              message.error,
              'has result:',
              message.result !== undefined,
            );
            const pending = this._pendingRequests.get(message.id);
            if (pending) {
              this._pendingRequests.delete(message.id);
              if (message.error) {
                pending.reject(new Error(`CDP error: ${message.error.message}`));
              } else {
                pending.resolve(message.result);
              }
            } else {
              this._log('No pending request found for id:', message.id);
            }
          }
        } catch (e) {
          this._log('Failed to parse CDP message:', e);
        }
      });
    });
  }
}
