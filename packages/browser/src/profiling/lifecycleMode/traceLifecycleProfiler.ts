import type { Client, ProfileChunk, Span } from '@sentry/core';
import {
  type ProfileChunkEnvelope,
  createEnvelope,
  debug,
  dsnToString,
  getGlobalScope,
  getRootSpan,
  getSdkMetadataForEnvelopeHeader,
  spanToJSON,
  uuid4,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { JSSelfProfiler } from '../jsSelfProfiling';
import { createProfileChunkPayload, startJSSelfProfile } from '../utils';

const CHUNK_INTERVAL_MS = 60_000;

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
export class BrowserTraceLifecycleProfiler {
  private _client: Client | undefined;
  private _profiler: JSSelfProfiler | undefined;
  private _chunkTimer: ReturnType<typeof setTimeout> | undefined;
  private _activeRootSpanCount: number;
  // For keeping track of active root spans
  private _activeRootSpanIds: Set<string>;
  private _profilerId: string | undefined;
  private _isRunning: boolean;
  private _sessionSampled: boolean;

  public constructor() {
    this._client = undefined;
    this._profiler = undefined;
    this._chunkTimer = undefined;
    this._activeRootSpanCount = 0;
    this._activeRootSpanIds = new Set<string>();
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

      const rootSpanJSON = spanToJSON(span);
      const spanId = rootSpanJSON.span_id as string | undefined;
      if (!spanId) {
        return;
      }
      if (this._activeRootSpanIds.has(spanId)) {
        return;
      }
      this._activeRootSpanIds.add(spanId);

      const wasZero = this._activeRootSpanCount === 0;
      this._activeRootSpanCount++; // Increment before eventually starting the profiler
      DEBUG_BUILD &&
        debug.log(
          `[Profiling] Root span ${rootSpanJSON.description} started. Active root spans:`,
          this._activeRootSpanCount,
        );
      if (wasZero) {
        this.start();
      }
    });

    client.on('spanEnd', span => {
      if (!this._sessionSampled) {
        return;
      }

      const spanJSON = spanToJSON(span);
      const spanId = spanJSON.span_id as string | undefined;
      if (!spanId || !this._activeRootSpanIds.has(spanId)) {
        return;
      }

      this._activeRootSpanIds.delete(spanId);
      this._activeRootSpanCount = Math.max(0, this._activeRootSpanCount - 1);
      DEBUG_BUILD &&
        debug.log(
          `[Profiling] Root span ${spanJSON.description} ended. Active root spans: ${this._activeRootSpanCount}`,
        );
      if (this._activeRootSpanCount === 0) {
        this._collectCurrentChunk().catch(() => /* no catch */ {});

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
    if (!spanId || this._activeRootSpanIds.has(spanId)) {
      return;
    }

    const wasZero = this._activeRootSpanCount === 0;

    this._activeRootSpanIds.add(spanId);
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

      // Matching root spans with profiles
      getGlobalScope().setContext('profile', {
        profiler_id: this._profilerId,
      });
    }

    DEBUG_BUILD && debug.log('[Profiling] Started profiling with profile ID:', this._profilerId);

    this._startProfilerInstance();

    if (!this._profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Stopping trace lifecycle profiling.');
      this._isRunning = false;
      this._resetProfilerInfo();
      return;
    }

    this._scheduleNextChunk();
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

    // Collect whatever was currently recording
    this._collectCurrentChunk()
      .catch(() => /* no catch */ {})
      .finally(() => {
        this._resetProfilerInfo();
      });
  }

  /**
   * Resets profiling information from scope and class instance.
   */
  private _resetProfilerInfo(): void {
    this._profilerId = undefined;
    getGlobalScope().setContext('profile', {});
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
  private _scheduleNextChunk(): void {
    if (!this._isRunning) {
      return;
    }

    this._chunkTimer = setTimeout(() => {
      this._collectCurrentChunk().catch(() => /* no catch */ {});

      if (this._isRunning) {
        this._startProfilerInstance();

        if (!this._profiler) {
          // If restart failed, stop scheduling further chunks and reset context.
          this._isRunning = false;
          this._resetProfilerInfo();
          return;
        }
        this._scheduleNextChunk();
      }
    }, CHUNK_INTERVAL_MS);
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
