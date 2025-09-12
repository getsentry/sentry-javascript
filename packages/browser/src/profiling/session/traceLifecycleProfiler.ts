import type { Client, ContinuousThreadCpuProfile, ProfileChunk, Span } from '@sentry/core';
import {
  type ProfileChunkEnvelope,
  createEnvelope,
  debug,
  getRootSpan,
  getSdkMetadataForEnvelopeHeader,
  spanToJSON,
  uuid4,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { JSSelfProfiler } from '../jsSelfProfiling';
import { applyDebugMetadata as applyDebugImages, startJSSelfProfile } from '../utils';

const CHUNK_INTERVAL_MS = 60_000;

/**
 * Browser trace-lifecycle profiler (v2):
 * - Starts when the first sampled root span starts
 * - Stops when the last sampled root span ends
 * - While running, periodically stops and restarts the JS self-profiling API to collect chunks
 *
 * Profiles are emitted as standalone `profile_chunk` envelopes either when:
 * - there are no more sampled root spans, or
 * - the 60s chunk timer elapses while profiling is running.
 */
export class BrowserTraceLifecycleProfiler {
  private _client: Client | undefined;
  private _profiler: JSSelfProfiler | undefined;
  private _chunkTimer: ReturnType<typeof setTimeout> | undefined;
  private _activeRootSpanCount: number;
  private _rootSpanIds: Set<string>;
  private _profilerId: string | undefined;
  private _isRunning: boolean;
  private _sessionSampled: boolean;

  public constructor() {
    this._client = undefined;
    this._profiler = undefined;
    this._chunkTimer = undefined;
    this._activeRootSpanCount = 0;
    this._rootSpanIds = new Set<string>();
    this._profilerId = undefined;
    this._isRunning = false;
    this._sessionSampled = false;
  }

  /**
   * Initialize the profiler with client and session sampling decision computed by the integration.
   */
  public initialize(client: Client, sessionSampled: boolean): void {
    DEBUG_BUILD && debug.log("[Profiling] Initializing profiler (lifecycle='trace').");

    this._client = client;
    this._sessionSampled = sessionSampled;

    client.on('spanStart', span => {
      if (span !== getRootSpan(span)) {
        return;
      }
      if (!this._sessionSampled) {
        DEBUG_BUILD && debug.log('[Profiling] Session not sampled because of negative sampling decision.');
        return;
      }
      // Only count sampled root spans
      if (!span.isRecording()) {
        DEBUG_BUILD && debug.log('[Profiling] Discarding profile because root span was not sampled.');
        return;
      }

      const spanId = spanToJSON(span)?.span_id as string | undefined;
      if (!spanId) {
        return;
      }
      if (this._rootSpanIds.has(spanId)) {
        return;
      }
      this._rootSpanIds.add(spanId);

      const wasZero = this._activeRootSpanCount === 0;
      this._activeRootSpanCount++; // Increment before eventually starting the profiler
      DEBUG_BUILD && debug.log('[Profiling] Root span started. Active root spans:', this._activeRootSpanCount);
      if (wasZero) {
        this.start();
      }
    });

    client.on('spanEnd', span => {
      if (!this._sessionSampled) {
        return;
      }
      const spanId = spanToJSON(span)?.span_id as string | undefined;
      if (!spanId || !this._rootSpanIds.has(spanId)) {
        return;
      }

      this._rootSpanIds.delete(spanId);
      this._activeRootSpanCount = Math.max(0, this._activeRootSpanCount - 1);
      DEBUG_BUILD && debug.log('[Profiling] Root span ended. Active root spans:', this._activeRootSpanCount);
      if (this._activeRootSpanCount === 0) {
        this._collectCurrentChunk().catch(() => {
          /* no catch */
        });
        this.stop();
      }
    });
  }

  /**
   * Handle an already-active root span at integration setup time.
   */
  public notifyRootSpanActive(span: Span): void {
    if (!this._sessionSampled) {
      return;
    }
    if (span !== getRootSpan(span)) {
      return;
    }
    const spanId = spanToJSON(span)?.span_id;
    if (!spanId || this._rootSpanIds.has(spanId)) {
      return;
    }

    const wasZero = this._activeRootSpanCount === 0;

    this._rootSpanIds.add(spanId);
    this._activeRootSpanCount++;
    DEBUG_BUILD &&
      debug.log(
        '[Profiling] Detected already active root span during setup. Active root spans:',
        this._activeRootSpanCount,
      );

    if (wasZero) {
      this.start();
    }
  }

  /**
   * Start profiling if not already running.
   */
  public start(): void {
    if (this._isRunning) {
      return;
    }

    this._isRunning = true;
    if (!this._profilerId) {
      this._profilerId = uuid4();
    }

    DEBUG_BUILD && debug.log('[Profiling] Started profiling with profile ID:', this._profilerId);

    this._startProfilerInstance();
    this._scheduleNextChunk();
  }

  /**
   * Stop profiling; final chunk will be collected and sent.
   */
  public stop(): void {
    this._isRunning = false;
    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = undefined;
    }

    this._collectCurrentChunk().catch(() => {
      /* no catch */
    });
    // Reset profiler id so a new continuous session gets a fresh id
    this._profilerId = undefined;
  }

  /**
   * Start a profiler instance if needed.
   */
  private _startProfilerInstance(): void {
    if (this._profiler?.stopped === false) {
      return;
    }
    const profiler = startJSSelfProfile();
    if (!profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS self profiler in trace lifecycle.');
      return;
    }
    this._profiler = profiler;
  }

  /**
   * Schedule the next 60s chunk while running.
   * Each tick collects a chunk and restarts the profiler.
   * A chunk should be closed when there are no active root spans anymore OR when the maximum chunk interval is reached.
   */
  private _scheduleNextChunk(): void {
    if (!this._isRunning) {
      return;
    }

    this._chunkTimer = setTimeout(() => {
      this._collectCurrentChunk().catch(() => {
        /* no catch */
      });

      if (this._isRunning) {
        this._startProfilerInstance();
        this._scheduleNextChunk();
      }
    }, CHUNK_INTERVAL_MS);
  }

  /**
   * Stop the current profiler, convert and send a profile chunk.
   */
  private async _collectCurrentChunk(): Promise<void> {
    const profiler = this._profiler;
    this._profiler = undefined;
    if (!profiler) {
      return;
    }

    try {
      const profile = await profiler.stop();
      const continuous = this._toContinuousProfile(profile);
      const chunk: ProfileChunk = this._makeProfileChunk(continuous);

      this._sendProfileChunk(chunk);
      DEBUG_BUILD && debug.log('[Profiling] Collected browser profile chunk.');
    } catch (e) {
      DEBUG_BUILD && debug.log('[Profiling] Error while stopping JS self profiler for chunk:', e);
    }
  }

  /**
   * Send a profile chunk as a standalone envelope.
   */
  private _sendProfileChunk(chunk: ProfileChunk): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const client = this._client!;
    const sdkInfo = getSdkMetadataForEnvelopeHeader(client.getSdkMetadata?.());

    const envelope: ProfileChunkEnvelope = createEnvelope(
      {
        event_id: uuid4(),
        sent_at: new Date().toISOString(),
        ...(sdkInfo && { sdk: sdkInfo }),
      },
      [[{ type: 'profile_chunk' }, chunk]],
    ) as ProfileChunkEnvelope;

    client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending profile chunk envelope:', reason);
    });
  }

  /**
   * Convert from JSSelfProfile format to ContinuousThreadCpuProfile format.
   */
  private _toContinuousProfile(input: {
    frames: { name: string; resourceId?: number; line?: number; column?: number }[];
    stacks: { frameId: number; parentId?: number }[];
    samples: { timestamp: number; stackId?: number }[];
    resources: string[];
  }): ContinuousThreadCpuProfile {
    const frames: ContinuousThreadCpuProfile['frames'] = [];
    for (let i = 0; i < input.frames.length; i++) {
      const f = input.frames[i];
      if (!f) {
        continue;
      }
      frames[i] = {
        function: f.name,
        abs_path: typeof f.resourceId === 'number' ? input.resources[f.resourceId] : undefined,
        lineno: f.line,
        colno: f.column,
      };
    }

    const stacks: ContinuousThreadCpuProfile['stacks'] = [];
    for (let i = 0; i < input.stacks.length; i++) {
      const s = input.stacks[i];
      if (!s) {
        continue;
      }
      const list: number[] = [];
      let cur: { frameId: number; parentId?: number } | undefined = s;
      while (cur) {
        list.push(cur.frameId);
        cur = cur.parentId === undefined ? undefined : input.stacks[cur.parentId];
      }
      stacks[i] = list;
    }

    const samples: ContinuousThreadCpuProfile['samples'] = [];
    for (let i = 0; i < input.samples.length; i++) {
      const s = input.samples[i];
      if (!s) {
        continue;
      }
      samples[i] = {
        stack_id: s.stackId ?? 0,
        thread_id: '0',
        timestamp: performance.timeOrigin + s.timestamp,
      };
    }

    return {
      frames,
      stacks,
      samples,
      thread_metadata: { '0': { name: 'main' } },
    };
  }

  /**
   * Create a profile chunk envelope item from a ContinuousThreadCpuProfile.
   */
  private _makeProfileChunk(profile: ContinuousThreadCpuProfile): ProfileChunk {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const client = this._client!;
    const options = client.getOptions();
    const sdk = client.getSdkMetadata?.()?.sdk;

    return {
      chunk_id: uuid4(),
      client_sdk: {
        name: sdk?.name ?? 'sentry.javascript.browser',
        version: sdk?.version ?? '0.0.0',
      },
      profiler_id: this._profilerId || uuid4(),
      platform: 'javascript',
      version: '2',
      release: options.release ?? '',
      environment: options.environment ?? 'production',
      debug_meta: { images: applyDebugImages([]) },
      profile,
    };
  }
}
