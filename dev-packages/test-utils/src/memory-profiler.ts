import type { HeapUsage } from './cdp-client';
import { CDPClient } from './cdp-client';

/**
 * Options for creating a MemoryProfiler.
 */
export interface MemoryProfilerOptions {
  /**
   * Inspector port number.
   * @default 9229
   */
  port?: number;

  /**
   * WebSocket path (e.g., '/ws' for wrangler, '' for Node.js inspector).
   * @default '/ws'
   */
  path?: string;

  /**
   * Host address.
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Number of connection retry attempts.
   * @default 10
   */
  retries?: number;

  /**
   * Delay between retry attempts in milliseconds.
   * @default 2000
   */
  retryDelayMs?: number;

  /**
   * Delay after garbage collection in milliseconds.
   * This gives V8 time to complete GC before measuring.
   * @default 2000
   */
  gcSettleDelayMs?: number;

  /**
   * Enable debug logging.
   * @default false
   */
  debug?: boolean;

  /**
   * Timeout for heap snapshot operations in milliseconds.
   * Heap snapshots can be slow, especially on CI environments.
   * @default 120000 (2 minutes)
   */
  heapSnapshotTimeoutMs?: number;
}

/**
 * Result from a memory profiling session.
 */
export interface MemoryProfilingResult {
  /** Heap usage at the start of profiling (after GC). */
  baseline: HeapUsage;
  /** Heap usage at the end of profiling (after GC). */
  final: HeapUsage;
  /** Memory growth in bytes. */
  growthBytes: number;
  /** Memory growth in kilobytes. */
  growthKB: number;
}

/**
 * High-level memory profiler for V8 inspector endpoints.
 *
 * Provides a simple API for memory testing via CDP (Chrome DevTools Protocol).
 * Works with any V8 inspector endpoint including:
 * - Wrangler dev server (Cloudflare Workers)
 * - Node.js inspector (--inspect flag)
 *
 * @example
 * ```typescript
 * const profiler = new MemoryProfiler({ port: 9229 });
 * await profiler.connect();
 *
 * await profiler.startProfiling();
 *
 * // ... run some operations that might leak memory ...
 *
 * const result = await profiler.stopProfiling();
 * console.log(`Memory growth: ${result.growthKB} KB`);
 *
 * await profiler.close();
 * ```
 */
export class MemoryProfiler {
  private readonly _cdp: CDPClient;
  private readonly _gcSettleDelayMs: number;
  private readonly _heapSnapshotTimeoutMs: number;
  private _initialized: boolean;
  private _baseline: HeapUsage | null;

  public constructor(options: MemoryProfilerOptions = {}) {
    const {
      port = 9229,
      path = '/ws',
      host = '127.0.0.1',
      retries = 10,
      retryDelayMs = 2000,
      gcSettleDelayMs = 3000,
      debug = false,
      heapSnapshotTimeoutMs = 120_000,
    } = options;

    this._cdp = new CDPClient({
      url: `ws://${host}:${port}${path}`,
      retries,
      retryDelayMs,
      debug,
    });
    this._gcSettleDelayMs = gcSettleDelayMs;
    this._heapSnapshotTimeoutMs = heapSnapshotTimeoutMs;
    this._initialized = false;
    this._baseline = null;
  }

  /**
   * Connect to the V8 inspector and enable required CDP domains.
   */
  public async connect(): Promise<void> {
    await this._cdp.connect();
    await this._cdp.send('HeapProfiler.enable');
    await this._cdp.send('Runtime.enable');
    this._initialized = true;
  }

  /**
   * Check if the profiler is connected to the inspector.
   */
  public isConnected(): boolean {
    return this._cdp.isConnected() && this._initialized;
  }

  /**
   * Start a memory profiling session.
   * Forces garbage collection and captures baseline heap usage.
   */
  public async startProfiling(): Promise<void> {
    this._ensureConnected();
    await this._collectGarbage();
    this._baseline = await this._getHeapUsage();
  }

  /**
   * Stop the memory profiling session and get the results.
   * Forces garbage collection and compares final heap to baseline.
   *
   * @returns Profiling result with baseline, final heap usage, and growth metrics.
   */
  public async stopProfiling(): Promise<MemoryProfilingResult> {
    this._ensureConnected();
    if (!this._baseline) {
      throw new Error('Profiling not started. Call startProfiling() first.');
    }

    await this._collectGarbage();
    const final = await this._getHeapUsage();
    const baseline = this._baseline;

    // Reset for next profiling session
    this._baseline = null;

    const growthBytes = final.usedSize - baseline.usedSize;
    const growthKB = growthBytes / 1024;

    return {
      baseline,
      final,
      growthBytes,
      growthKB,
    };
  }

  /**
   * Take a heap snapshot and return it as a string.
   * The snapshot is in V8 heap snapshot format (JSON) and can be loaded
   * into Chrome DevTools for analysis.
   *
   * @returns The heap snapshot as a JSON string.
   */
  public async takeHeapSnapshot(): Promise<string> {
    this._ensureConnected();

    const chunks: string[] = [];

    const chunkHandler = (params: Record<string, unknown>): void => {
      if (typeof params.chunk === 'string') {
        chunks.push(params.chunk);
      }
    };

    this._cdp.on('HeapProfiler.addHeapSnapshotChunk', chunkHandler);

    try {
      await this._cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, this._heapSnapshotTimeoutMs);
    } finally {
      this._cdp.off('HeapProfiler.addHeapSnapshotChunk', chunkHandler);
    }

    return chunks.join('');
  }

  /**
   * Close the connection to the inspector.
   */
  public async close(): Promise<void> {
    await this._cdp.close();
    this._initialized = false;
    this._baseline = null;
  }

  private _ensureConnected(): void {
    if (!this._initialized) {
      throw new Error('MemoryProfiler not connected. Call connect() first.');
    }
  }

  private async _collectGarbage(): Promise<void> {
    // Use fire-and-forget because some V8 inspectors (like wrangler) don't respond to this command
    await this._cdp.sendFireAndForget('HeapProfiler.collectGarbage', undefined, this._gcSettleDelayMs);
  }

  private async _getHeapUsage(): Promise<HeapUsage> {
    return this._cdp.send<HeapUsage>('Runtime.getHeapUsage');
  }
}
