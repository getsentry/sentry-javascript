import type { Client, ProfileChunk, Span } from '@sentry/core';
import {
  type ProfileChunkEnvelope,
  createEnvelope,
  debug,
  dsnToString,
  getGlobalScope,
  getRootSpan,
  getSdkMetadataForEnvelopeHeader,
  uuid4,
} from '@sentry/core';
import { DEBUG_BUILD } from './../debug-build';
import type { JSSelfProfiler } from './jsSelfProfiling';
import { createProfileChunkPayload, startJSSelfProfile, validateProfileChunk } from './utils';

const CHUNK_INTERVAL_MS = 60_000; // 1 minute
// Maximum length for trace lifecycle profiling per root span (e.g. if spanEnd never fires)
const MAX_ROOT_SPAN_PROFILE_MS = 300_000; // 5 minutes

/**
 * Browser trace-lifecycle profiler (UI Profiling / Profiling V2):
 * - Starts when the first sampled root span starts
 * - Stops when the last sampled root span ends
 * - While running, periodically stops and restarts the JS self-profiling API to collect chunks
 *
 * Profiles are emitted as standalone `profile_chunk` envelopes either when:
 * - there are no more sampled root spans, or
 * - the 60s chunk timer elapses while profiling is running.
 */
export class UIProfiler {
  private _client: Client | undefined;
  private _profiler: JSSelfProfiler | undefined;
  private _chunkTimer: ReturnType<typeof setTimeout> | undefined;
  // For keeping track of active root spans
  private _activeRootSpanIds: Set<string>;
  private _rootSpanTimeouts: Map<string, ReturnType<typeof setTimeout>>;
  // ID for Profiler session
  private _profilerId: string | undefined;
  private _isRunning: boolean;
  private _sessionSampled: boolean;

  public constructor() {
    this._client = undefined;
    this._profiler = undefined;
    this._chunkTimer = undefined;
    this._activeRootSpanIds = new Set<string>();
    this._rootSpanTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
    this._profilerId = undefined;
    this._isRunning = false;
    this._sessionSampled = false;
  }

  /**
   * Initialize the profiler with client and session sampling decision computed by the integration.
   */
  public initialize(client: Client, sessionSampled: boolean): void {
    // One Profiler ID per profiling session (user session)
    this._profilerId = uuid4();

    DEBUG_BUILD && debug.log("[Profiling] Initializing profiler (lifecycle='trace').");

    this._client = client;
    this._sessionSampled = sessionSampled;

    this._setupTraceLifecycleListeners(client);
  }

  /**
   * Handle an already-active root span at integration setup time.
   */
  public notifyRootSpanActive(rootSpan: Span): void {
    if (!this._sessionSampled) {
      return;
    }

    const spanId = rootSpan.spanContext().spanId;
    if (!spanId || this._activeRootSpanIds.has(spanId)) {
      return;
    }

    this._activeRootSpanIds.add(spanId);

    const rootSpanCount = this._activeRootSpanIds.size;

    if (rootSpanCount === 1) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Detected already active root span during setup. Active root spans now:', rootSpanCount);

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

    DEBUG_BUILD && debug.log('[Profiling] Started profiling with profile ID:', this._profilerId);

    // Expose profiler_id to match root spans with profiles
    getGlobalScope().setContext('profile', { profiler_id: this._profilerId });

    this._startProfilerInstance();

    if (!this._profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Stopping trace lifecycle profiling.');
      this._resetProfilerInfo();
      return;
    }

    this._startPeriodicChunking();
  }

  /**
   * Stop profiling; final chunk will be collected and sent.
   */
  public stop(): void {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;
    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = undefined;
    }

    this._clearAllRootSpanTimeouts();

    // Collect whatever was currently recording
    this._collectCurrentChunk().catch(e => {
      DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk on `stop()`:', e);
    });
  }

  /** Trace-mode: attach spanStart/spanEnd listeners. */
  private _setupTraceLifecycleListeners(client: Client): void {
    client.on('spanStart', span => {
      if (!this._sessionSampled) {
        DEBUG_BUILD && debug.log('[Profiling] Session not sampled because of negative sampling decision.');
        return;
      }
      if (span !== getRootSpan(span)) {
        return; // only care about root spans
      }
      // Only count sampled root spans
      if (!span.isRecording()) {
        DEBUG_BUILD && debug.log('[Profiling] Discarding profile because root span was not sampled.');
        return;
      }

      const spanId = span.spanContext().spanId;
      if (!spanId || this._activeRootSpanIds.has(spanId)) {
        return;
      }

      this._registerTraceRootSpan(spanId);

      const rootSpanCount = this._activeRootSpanIds.size;
      if (rootSpanCount === 1) {
        DEBUG_BUILD &&
          debug.log(
            `[Profiling] Root span ${spanId} started. Profiling active while there are active root spans (count=${rootSpanCount}).`,
          );
        this.start();
      }
    });

    client.on('spanEnd', span => {
      if (!this._sessionSampled) {
        return;
      }
      const spanId = span.spanContext().spanId;
      if (!spanId || !this._activeRootSpanIds.has(spanId)) {
        return;
      }
      this._activeRootSpanIds.delete(spanId);
      const rootSpanCount = this._activeRootSpanIds.size;

      DEBUG_BUILD &&
        debug.log(
          `[Profiling] Root span with ID ${spanId} ended. Will continue profiling for as long as there are active root spans (currently: ${rootSpanCount}).`,
        );
      if (rootSpanCount === 0) {
        this._collectCurrentChunk().catch(e => {
          DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk on last `spanEnd`:', e);
        });
        this.stop();
      }
    });
  }

  /**
   * Resets profiling information from scope and resets running state
   */
  private _resetProfilerInfo(): void {
    this._isRunning = false;
    getGlobalScope().setContext('profile', {});
  }

  /**
   * Clear and reset all per-root-span timeouts.
   */
  private _clearAllRootSpanTimeouts(): void {
    this._rootSpanTimeouts.forEach(timeout => clearTimeout(timeout));
    this._rootSpanTimeouts.clear();
  }

  /** Register root span and schedule safeguard timeout (trace mode). */
  private _registerTraceRootSpan(spanId: string): void {
    this._activeRootSpanIds.add(spanId);
    const timeout = setTimeout(() => this._onRootSpanTimeout(spanId), MAX_ROOT_SPAN_PROFILE_MS);
    this._rootSpanTimeouts.set(spanId, timeout);
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
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS Profiler in trace lifecycle.');
      return;
    }
    this._profiler = profiler;
  }

  /**
   * Schedule the next 60s chunk while running.
   * Each tick collects a chunk and restarts the profiler.
   * A chunk should be closed when there are no active root spans anymore OR when the maximum chunk interval is reached.
   */
  private _startPeriodicChunking(): void {
    if (!this._isRunning) {
      return;
    }

    this._chunkTimer = setTimeout(() => {
      this._collectCurrentChunk().catch(e => {
        DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk during periodic chunking:', e);
      });

      if (this._isRunning) {
        this._startProfilerInstance();

        if (!this._profiler) {
          // If restart failed, stop scheduling further chunks and reset context.
          this._resetProfilerInfo();
          return;
        }

        this._startPeriodicChunking();
      }
    }, CHUNK_INTERVAL_MS);
  }

  /**
   * Handle timeout for a specific root span ID to avoid indefinitely running profiler if `spanEnd` never fires.
   * If this was the last active root span, collect the current chunk and stop profiling.
   */
  private _onRootSpanTimeout(rootSpanId: string): void {
    // If span already ended, ignore
    if (!this._rootSpanTimeouts.has(rootSpanId)) {
      return;
    }
    this._rootSpanTimeouts.delete(rootSpanId);

    if (!this._activeRootSpanIds.has(rootSpanId)) {
      return;
    }

    DEBUG_BUILD &&
      debug.log(
        `[Profiling] Reached 5-minute timeout for root span ${rootSpanId}. You likely started a manual root span that never called \`.end()\`.`,
      );

    this._activeRootSpanIds.delete(rootSpanId);

    const rootSpanCount = this._activeRootSpanIds.size;
    if (rootSpanCount === 0) {
      this.stop();
    }
  }

  /**
   * Stop the current profiler, convert and send a profile chunk.
   */
  private async _collectCurrentChunk(): Promise<void> {
    const prevProfiler = this._profiler;
    this._profiler = undefined;

    if (!prevProfiler) {
      return;
    }

    try {
      const profile = await prevProfiler.stop();

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const chunk = createProfileChunkPayload(profile, this._client!, this._profilerId);

      // Validate chunk before sending
      const validationReturn = validateProfileChunk(chunk);
      if ('reason' in validationReturn) {
        DEBUG_BUILD &&
          debug.log(
            '[Profiling] Discarding invalid profile chunk (this is probably a bug in the SDK):',
            validationReturn.reason,
          );
        return;
      }

      this._sendProfileChunk(chunk);

      DEBUG_BUILD && debug.log('[Profiling] Collected browser profile chunk.');
    } catch (e) {
      DEBUG_BUILD && debug.log('[Profiling] Error while stopping JS Profiler for chunk:', e);
    }
  }

  /**
   * Send a profile chunk as a standalone envelope.
   */
  private _sendProfileChunk(chunk: ProfileChunk): void {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const client = this._client!;

    const sdkInfo = getSdkMetadataForEnvelopeHeader(client.getSdkMetadata?.());
    const dsn = client.getDsn();
    const tunnel = client.getOptions().tunnel;

    const envelope = createEnvelope<ProfileChunkEnvelope>(
      {
        event_id: uuid4(),
        sent_at: new Date().toISOString(),
        ...(sdkInfo && { sdk: sdkInfo }),
        ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
      },
      [[{ type: 'profile_chunk' }, chunk]],
    );

    client.sendEnvelope(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending profile chunk envelope:', reason);
    });
  }
}
