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
import { DEBUG_BUILD } from '../../debug-build';
import type { JSSelfProfiler } from '../jsSelfProfiling';
import { createProfileChunkPayload, startJSSelfProfile, validateProfileChunk } from '../utils';

// Unified constants (kept identical to previous implementations)
const CHUNK_INTERVAL_MS = 60_000; // 1 minute
const MAX_ROOT_SPAN_PROFILE_MS = 300_000; // 5 minutes max per root span in trace mode

/**
 * UIProfiler (Browser UI Profiling / Profiling V2)
 * Supports two lifecycle modes:
 *  - 'manual': controlled explicitly via start()/stop()
 *  - 'trace': automatically runs while there are active sampled root spans
 *
 * While running (either mode), we periodically stop and restart the JS self-profiling API
 * to emit standalone `profile_chunk` envelopes every 60s and when profiling stops.
 *
 * Public API surface (used by integration and user-facing profiler hooks):
 *  - initialize(client, sessionSampled, lifecycleMode)
 *  - start()
 *  - stop()
 *  - notifyRootSpanActive(span)  (only meaningful in 'trace' mode)
 */
export class UIProfiler {
  private _client: Client | undefined;
  private _profiler: JSSelfProfiler | undefined;
  private _chunkTimer: ReturnType<typeof setTimeout> | undefined;

  // Manual + Trace
  private _profilerId: string | undefined; // one per Profiler session
  private _isRunning: boolean; // current profiler instance active flag
  private _sessionSampled: boolean; // sampling decision for entire session
  private _lifecycleMode: 'manual' | 'trace' | undefined;

  // Trace-only
  private _activeRootSpanIds: Set<string>;
  private _rootSpanTimeouts: Map<string, ReturnType<typeof setTimeout>>;

  public constructor() {
    this._client = undefined;
    this._profiler = undefined;
    this._chunkTimer = undefined;

    this._profilerId = undefined;
    this._isRunning = false;
    this._sessionSampled = false;
    this._lifecycleMode = undefined;

    this._activeRootSpanIds = new Set();
    this._rootSpanTimeouts = new Map();
  }

  /** Initialize the profiler with client, session sampling and lifecycle mode. */
  public initialize(client: Client, sessionSampled: boolean, lifecycleMode: 'manual' | 'trace'): void {
    this._client = client;
    this._sessionSampled = sessionSampled;
    this._lifecycleMode = lifecycleMode;

    // One profiler ID for the entire profiling session (user session)
    this._profilerId = uuid4();

    DEBUG_BUILD && debug.log(`[Profiling] Initializing profiler (lifecycle='${lifecycleMode}').`);

    if (!sessionSampled) {
      DEBUG_BUILD && debug.log('[Profiling] Session not sampled; profiler will remain inactive.');
    }

    if (lifecycleMode === 'trace') {
      this._setupTraceLifecycleListeners(client);
    }
  }

  /** Start profiling manually (only effective in 'manual' mode and when sampled). */
  public start(): void {
    if (this._lifecycleMode === 'trace') {
      DEBUG_BUILD &&
        debug.log('[Profiling] `profileLifecycle` is set to "trace"; manual start() calls are ignored in trace mode.');
      return;
    }

    if (this._isRunning) {
      DEBUG_BUILD && debug.log('[Profiling] Profile session already running, no-op.');
      return;
    }

    if (!this._sessionSampled) {
      DEBUG_BUILD && debug.log('[Profiling] Session not sampled, start() is a no-op.');
      return;
    }

    this._beginProfiling();
  }

  /** Stop profiling manually (only effective in 'manual' mode). */
  public stop(): void {
    if (this._lifecycleMode === 'trace') {
      DEBUG_BUILD &&
        debug.log('[Profiling] `profileLifecycle` is set to "trace"; manual stop() calls are ignored in trace mode.');
      return;
    }

    if (!this._isRunning) {
      DEBUG_BUILD && debug.log('[Profiling] No profile session running, stop() is a no-op.');
      return;
    }

    this._endProfiling();
  }

  /** Notify the profiler of a root span active at setup time (used only in trace mode). */
  public notifyRootSpanActive(span: Span): void {
    if (this._lifecycleMode !== 'trace' || !this._sessionSampled) {
      return;
    }
    const spanId = span.spanContext().spanId;
    if (!spanId || this._activeRootSpanIds.has(spanId)) {
      return;
    }
    this._registerTraceRootSpan(spanId);
  }

  /* ========================= Internal Helpers ========================= */

  /** Begin profiling session (shared path used by manual start or trace activation). */
  private _beginProfiling(): void {
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;

    // Expose profiler_id so emitted events can be associated
    getGlobalScope().setContext('profile', { profiler_id: this._profilerId });

    DEBUG_BUILD && debug.log('[Profiling] Started profiling with profiler ID:', this._profilerId);

    this._startProfilerInstance();
    if (!this._profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS Profiler; stopping.');
      this._resetProfilerInfo();
      return;
    }

    this._startPeriodicChunking();
  }

  /** End profiling session, collect final chunk. */
  private _endProfiling(): void {
    if (!this._isRunning) {
      return;
    }
    this._isRunning = false;

    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = undefined;
    }

    // Clear trace-mode timeouts if any
    this._clearAllRootSpanTimeouts();

    this._collectCurrentChunk().catch(e => {
      DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk on stop():', e);
    });

    // Clear context so subsequent events aren't marked as profiled
    getGlobalScope().setContext('profile', {});
  }

  /** Trace-mode: attach spanStart/spanEnd listeners. */
  private _setupTraceLifecycleListeners(client: Client): void {
    client.on('spanStart', span => {
      if (!this._sessionSampled) {
        DEBUG_BUILD && debug.log('[Profiling] Session not sampled; ignoring spanStart.');
        return;
      }
      if (span !== getRootSpan(span)) {
        return; // only care about root spans
      }
      // Only count sampled root spans
      if (!span.isRecording()) {
        DEBUG_BUILD && debug.log('[Profiling] Ignoring non-sampled root span.');
        return;
      }

      /*
      // Matching root spans with profiles
      getGlobalScope().setContext('profile', {
        profiler_id: this._profilerId,
      });
       */

      const spanId = span.spanContext().spanId;
      if (!spanId || this._activeRootSpanIds.has(spanId)) {
        return;
      }
      this._registerTraceRootSpan(spanId);

      const count = this._activeRootSpanIds.size;
      if (count === 1) {
        DEBUG_BUILD &&
          debug.log(
            `[Profiling] Root span ${spanId} started. Profiling active while there are active root spans (count=${count}).`,
          );
        this._beginProfiling();
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

      const count = this._activeRootSpanIds.size;
      DEBUG_BUILD && debug.log(`[Profiling] Root span ${spanId} ended. Remaining active root spans (count=${count}).`);

      if (count === 0) {
        // Collect final chunk before stopping
        this._collectCurrentChunk().catch(e => {
          DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk on last spanEnd:', e);
        });
        this._endProfiling();
      }
    });
  }

  /** Register root span and schedule safeguard timeout (trace mode). */
  private _registerTraceRootSpan(spanId: string): void {
    this._activeRootSpanIds.add(spanId);
    const timeout = setTimeout(() => this._onRootSpanTimeout(spanId), MAX_ROOT_SPAN_PROFILE_MS);
    this._rootSpanTimeouts.set(spanId, timeout);
  }

  /** Root span timeout handler (trace mode). */
  private _onRootSpanTimeout(spanId: string): void {
    if (!this._rootSpanTimeouts.has(spanId)) {
      return; // span already ended
    }
    this._rootSpanTimeouts.delete(spanId);

    if (!this._activeRootSpanIds.has(spanId)) {
      return;
    }

    DEBUG_BUILD &&
      debug.log(`[Profiling] Reached 5-minute timeout for root span ${spanId}. Did you forget to call .end()?`);

    this._activeRootSpanIds.delete(spanId);

    if (this._activeRootSpanIds.size === 0) {
      this._endProfiling();
    }
  }

  /** Clear all trace-mode root span timeouts. */
  private _clearAllRootSpanTimeouts(): void {
    this._rootSpanTimeouts.forEach(t => clearTimeout(t));
    this._rootSpanTimeouts.clear();
  }

  /** Reset running state and profiling context (used on failure). */
  private _resetProfilerInfo(): void {
    this._isRunning = false;
    getGlobalScope().setContext('profile', {});
  }

  /** Start JS self profiler instance if needed. */
  private _startProfilerInstance(): void {
    if (this._profiler?.stopped === false) {
      return; // already running
    }
    const profiler = startJSSelfProfile();
    if (!profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS self profiler.');
      return;
    }
    this._profiler = profiler;
  }

  /** Schedule periodic chunk collection while running. */
  private _startPeriodicChunking(): void {
    if (!this._isRunning) {
      return;
    }

    this._chunkTimer = setTimeout(() => {
      this._collectCurrentChunk().catch(e => {
        DEBUG_BUILD && debug.error('[Profiling] Failed to collect profile chunk during periodic chunking:', e);
      });

      if (this._isRunning) {
        this._startProfilerInstance();
        if (!this._profiler) {
          // Could not restart -> stop profiling gracefully
          this._resetProfilerInfo();
          return;
        }
        this._startPeriodicChunking();
      }
    }, CHUNK_INTERVAL_MS);
  }

  /** Stop current profiler instance, convert profile to chunk & send. */
  private async _collectCurrentChunk(): Promise<void> {
    const prev = this._profiler;
    this._profiler = undefined;
    if (!prev) {
      return;
    }
    try {
      const profile = await prev.stop();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const chunk = createProfileChunkPayload(profile, this._client!, this._profilerId);
      const validation = validateProfileChunk(chunk);
      if ('reason' in validation) {
        DEBUG_BUILD &&
          debug.log(
            '[Profiling] Discarding invalid profile chunk (this is probably a bug in the SDK):',
            validation.reason,
          );
        return;
      }
      this._sendProfileChunk(chunk);
      DEBUG_BUILD && debug.log('[Profiling] Collected browser profile chunk.');
    } catch (e) {
      DEBUG_BUILD && debug.log('[Profiling] Error while stopping JS Profiler for chunk:', e);
    }
  }

  /** Send a profile chunk as a standalone envelope. */
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
