import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';
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
}

/**
 * V8 heap snapshot format (partial).
 */
interface V8HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      edge_fields: string[];
    };
  };
  nodes: number[];
  edges: number[];
}

/**
 * Parsed snapshot statistics.
 */
export interface SnapshotStats {
  nodeCount: number;
  edgeCount: number;
  totalSize: number;
}

/**
 * Result from comparing two heap snapshots.
 */
export interface SnapshotComparisonResult {
  baseline: SnapshotStats;
  final: SnapshotStats;
  nodeGrowth: number;
  nodeGrowthPercent: number;
  edgeGrowth: number;
  edgeGrowthPercent: number;
  sizeGrowth: number;
  sizeGrowthPercent: number;
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
 * // ... make initial requests to let the runtime settle ...
 *
 * const baseline = await profiler.takeHeapSnapshot();
 *
 * // ... run some operations that might leak memory ...
 *
 * const final = await profiler.takeHeapSnapshot();
 *
 * const result = profiler.compareSnapshots(baseline, final);
 * console.log(`Node growth: ${result.nodeGrowthPercent.toFixed(2)}%`);
 *
 * await profiler.close();
 * ```
 */
export class MemoryProfiler {
  private readonly _cdp: CDPClient;
  private readonly _gcSettleDelayMs: number;
  private _initialized: boolean;

  readonly #debug: boolean;

  public constructor(options: MemoryProfilerOptions = {}) {
    const {
      port = 9229,
      path = '/ws',
      host = '127.0.0.1',
      retries = 10,
      retryDelayMs = 2000,
      gcSettleDelayMs = 3000,
      debug = false,
    } = options;

    this.#debug = debug;

    this._cdp = new CDPClient({
      url: `ws://${host}:${port}${path}`,
      retries,
      retryDelayMs,
      debug,
    });
    this._gcSettleDelayMs = gcSettleDelayMs;
    this._initialized = false;
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
   * Capture a V8 heap snapshot. If `outputPath` is provided, the snapshot is written there
   * as a `.heapsnapshot` file that can be loaded into Chrome DevTools (Memory tab → Load).
   *
   * Some V8 inspectors (e.g., wrangler) stream chunks via `HeapProfiler.addHeapSnapshotChunk`
   * but never send a response to the `takeHeapSnapshot` request. We work around that by
   * resolving once chunk events go idle for `chunkIdleMs` (default 2s).
   *
   * @returns The full snapshot string.
   */
  public async takeHeapSnapshot(outputPath?: string, chunkIdleMs = 2000): Promise<string> {
    this._ensureConnected();
    await this._collectGarbage();

    const chunks: string[] = [];
    let lastChunkAt = Date.now();
    let receivedAny = false;

    const unsubscribe = this._cdp.on('HeapProfiler.addHeapSnapshotChunk', params => {
      const chunk = (params as { chunk?: string }).chunk;
      if (typeof chunk === 'string') {
        chunks.push(chunk);
        lastChunkAt = Date.now();
        receivedAny = true;
      }
    });

    try {
      await this._cdp.sendFireAndForget('HeapProfiler.takeHeapSnapshot', {
        reportProgress: false,
        captureNumericValue: false,
      });

      // Poll until chunks stop arriving for `chunkIdleMs`.
      const pollInterval = 200;
      while (!receivedAny || Date.now() - lastChunkAt < chunkIdleMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    } finally {
      unsubscribe();
    }

    const snapshot = chunks.join('');

    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, snapshot, 'utf8');
    }

    return snapshot;
  }

  /**
   * Compare two heap snapshots and return growth metrics.
   * This is more reliable than `Runtime.getHeapUsage` for leak detection
   * as it measures actual retained objects rather than V8 internal metrics.
   */
  public compareSnapshots(baselineSnapshot: string, finalSnapshot: string): SnapshotComparisonResult {
    const baseline = this._parseSnapshotStats(baselineSnapshot);
    const final = this._parseSnapshotStats(finalSnapshot);

    const nodeGrowth = final.nodeCount - baseline.nodeCount;
    const edgeGrowth = final.edgeCount - baseline.edgeCount;
    const sizeGrowth = final.totalSize - baseline.totalSize;

    const result: SnapshotComparisonResult = {
      baseline,
      final,
      nodeGrowth,
      nodeGrowthPercent: (nodeGrowth / baseline.nodeCount) * 100,
      edgeGrowth,
      edgeGrowthPercent: (edgeGrowth / baseline.edgeCount) * 100,
      sizeGrowth,
      sizeGrowthPercent: (sizeGrowth / baseline.totalSize) * 100,
    };

    if (this.#debug) {
      // eslint-disable-next-line no-console
      console.log('Snapshot comparison:', {
        baselineNodes: baseline.nodeCount,
        finalNodes: final.nodeCount,
        nodeGrowth,
        nodeGrowthPercent: `${result.nodeGrowthPercent.toFixed(2)}%`,
        sizeGrowthKB: (sizeGrowth / 1024).toFixed(2),
      });
    }

    return result;
  }

  /**
   * Parse a heap snapshot string and extract statistics.
   */
  private _parseSnapshotStats(snapshotJson: string): SnapshotStats {
    const snapshot = JSON.parse(snapshotJson) as V8HeapSnapshot;
    const meta = snapshot.snapshot?.meta;

    if (!meta?.node_fields) {
      throw new Error('Invalid heap snapshot format: missing meta.node_fields');
    }

    const nodeFieldCount = meta.node_fields.length;
    const nodeCount = snapshot.nodes.length / nodeFieldCount;
    const edgeCount = snapshot.edges.length / meta.edge_fields.length;

    const selfSizeIdx = meta.node_fields.indexOf('self_size');
    let totalSize = 0;

    if (selfSizeIdx !== -1) {
      for (let i = 0; i < snapshot.nodes.length; i += nodeFieldCount) {
        totalSize += snapshot.nodes[i + selfSizeIdx] ?? 0;
      }
    }

    return { nodeCount, edgeCount, totalSize };
  }

  /**
   * Close the connection to the inspector.
   */
  public async close(): Promise<void> {
    await this._cdp.close();
    this._initialized = false;
  }

  private _ensureConnected(): void {
    if (!this._initialized) {
      throw new Error('MemoryProfiler not connected. Call connect() first.');
    }
  }

  private async _collectGarbage(): Promise<void> {
    // Multiple GC passes to ensure full collection - some V8 inspectors need this
    for (let i = 0; i < 3; i++) {
      await this._cdp.sendFireAndForget('HeapProfiler.collectGarbage', undefined, 500);
    }
    // Final settle delay
    await new Promise(resolve => setTimeout(resolve, this._gcSettleDelayMs));
  }
}
