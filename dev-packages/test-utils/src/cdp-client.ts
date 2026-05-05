import { WebSocket } from 'ws';

/**
 * Configuration options for the Chrome Developer Protocol (CDP) client.
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

interface CDPResponse {
  id?: number;
  method?: string;
  params?: unknown;
  error?: { message: string };
  result?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

type EventHandler = (params: unknown) => void;

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
  #ws: WebSocket | null;
  #messageId: number;
  #pendingRequests: Map<number, PendingRequest>;
  #eventHandlers: Map<string, Set<EventHandler>>;
  #connected: boolean;
  readonly #options: Required<CDPClientOptions>;

  public constructor(options: CDPClientOptions) {
    this.#ws = null;
    this.#messageId = 0;
    this.#pendingRequests = new Map();
    this.#eventHandlers = new Map();
    this.#connected = false;
    this.#options = {
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
    const { retries, retryDelayMs } = this.#options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.#tryConnect();
        return;
      } catch (err) {
        this.#log(`Connection attempt ${attempt}/${retries} failed:`, (err as Error).message);
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
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const timeout = timeoutMs ?? this.#options.defaultTimeoutMs;
    const id = ++this.#messageId;
    const message = JSON.stringify({ id, method, params });

    this.#log('Sending:', method, params || '');

    return new Promise((resolve, reject) => {
      this.#pendingRequests.set(id, {
        resolve: value => resolve(value as T),
        reject,
      });
      this.#ws!.send(message);

      setTimeout(() => {
        if (this.#pendingRequests.has(id)) {
          this.#pendingRequests.delete(id);
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
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const id = ++this.#messageId;
    const message = JSON.stringify({ id, method, params });

    this.#log('Sending (fire-and-forget):', method, params || '');

    this.#ws.send(message);

    // Give the command time to execute
    await new Promise(resolve => setTimeout(resolve, settleDelayMs));
  }

  /**
   * Register a handler for a CDP event method (e.g., 'HeapProfiler.addHeapSnapshotChunk').
   * Returns a function that, when called, removes the handler.
   */
  public on(method: string, handler: EventHandler): () => void {
    let handlers = this.#eventHandlers.get(method);
    if (!handlers) {
      handlers = new Set();
      this.#eventHandlers.set(method, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.#eventHandlers.delete(method);
      }
    };
  }

  /**
   * Check if the client is currently connected.
   */
  public isConnected(): boolean {
    return this.#connected && this.#ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Close the WebSocket connection.
   */
  public async close(): Promise<void> {
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
      this.#connected = false;
    }
  }

  #log(...args: unknown[]): void {
    if (this.#options.debug) {
      // eslint-disable-next-line no-console
      console.log('[CDPClient]', ...args);
    }
  }

  async #tryConnect(): Promise<void> {
    const { url, connectionTimeoutMs } = this.#options;

    return new Promise((resolve, reject) => {
      this.#ws = new WebSocket(url);

      const timeoutId = setTimeout(() => {
        // Close the WebSocket to prevent state corruption from orphaned sockets on retry
        this.#ws?.close();
        reject(new Error(`Connection to ${url} timed out after ${connectionTimeoutMs}ms`));
      }, connectionTimeoutMs);

      this.#ws.on('open', () => {
        clearTimeout(timeoutId);
        this.#connected = true;
        this.#log('WebSocket connected to', url);
        resolve();
      });

      this.#ws.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        this.#ws?.close();
        reject(new Error(`Failed to connect to inspector at ${url}: ${err.message}`));
      });

      this.#ws.on('close', () => {
        this.#connected = false;
      });

      this.#setupMessageHandler();
    });
  }

  #setupMessageHandler(): void {
    this.#ws?.on('message', (data: Buffer) => {
      try {
        const rawMessage = data.toString();
        this.#log('Received raw message:', rawMessage.slice(0, 500));

        const message = JSON.parse(rawMessage) as CDPResponse;

        if (message.method) {
          this.#handleCdpEvent(message);
          return;
        }

        if (message.id !== undefined) {
          this.#handleCdpResponse(message);
        }
      } catch (e) {
        this.#log('Failed to parse CDP message:', e);
      }
    });
  }

  #handleCdpEvent(message: CDPResponse): void {
    this.#log('CDP event:', message.method);

    const handlers = this.#eventHandlers.get(message.method!);

    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message.params);
        } catch (err) {
          this.#log('Event handler threw:', err);
        }
      }
    }
  }

  #handleCdpResponse(message: CDPResponse): void {
    this.#log('CDP response for id:', message.id, 'error:', message.error, 'has result:', message.result !== undefined);

    const pending = this.#pendingRequests.get(message.id!);

    if (pending) {
      this.#pendingRequests.delete(message.id!);

      if (message.error) {
        pending.reject(new Error(`CDP error: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
    } else {
      this.#log('No pending request found for id:', message.id);
    }
  }
}
