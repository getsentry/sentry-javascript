import type { Client, ProfileChunk } from '@sentry/core';
import {
  type ProfileChunkEnvelope,
  createEnvelope,
  debug,
  dsnToString,
  getGlobalScope,
  getSdkMetadataForEnvelopeHeader,
  uuid4,
} from '@sentry/core';
import { DEBUG_BUILD } from '../../debug-build';
import type { JSSelfProfiler } from '../jsSelfProfiling';
import { createProfileChunkPayload, startJSSelfProfile, validateProfileChunk } from '../utils';

const CHUNK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Browser manual-lifecycle profiler (UI Profiling / Profiling V2):
 * - Controlled via explicit start()/stop() calls
 * - While running, periodically stops and restarts the JS self-profiling API to collect chunks
 * - Emits standalone `profile_chunk` envelopes on each chunk collection and on stop()
 */
export class BrowserManualLifecycleProfiler {
  private _client: Client | undefined;
  private _profiler: JSSelfProfiler | undefined;
  private _chunkTimer: ReturnType<typeof setTimeout> | undefined;
  private _profilerId: string | undefined;
  private _isRunning: boolean;
  private _sessionSampled: boolean;
  private _lifecycleMode: 'manual' | 'trace' | undefined;

  public constructor() {
    this._client = undefined;
    this._profiler = undefined;
    this._chunkTimer = undefined;
    this._profilerId = undefined;
    this._isRunning = false;
    this._sessionSampled = false;
    this._lifecycleMode = undefined;
  }

  /** Initialize the profiler with client, session sampling and (optionally) lifecycle mode for no-op warnings. */
  public initialize(client: Client, sessionSampled: boolean, lifecycleMode?: 'manual' | 'trace'): void {
    this._client = client;
    this._sessionSampled = sessionSampled;
    this._lifecycleMode = lifecycleMode;
    // One Profiler ID per profiling session (user session)
    this._profilerId = uuid4();

    DEBUG_BUILD && debug.log("[Profiling] Initializing profiler (lifecycle='manual').");
  }

  /** Start profiling if not already running. No-ops (with debug logs) when not sampled or in 'trace' mode. */
  public start(): void {
    if (this._isRunning) {
      DEBUG_BUILD && debug.log('[Profiling] Profile session already running, no-op.');
      return;
    }

    if (!this._sessionSampled) {
      DEBUG_BUILD && debug.log('[Profiling] Session not sampled, start() is a no-op.');
      return;
    }

    if (this._lifecycleMode === 'trace') {
      DEBUG_BUILD &&
        debug.log(
          '[Profiling] `profileLifecycle` is set to \"trace\"; manual start/stop calls are ignored in trace mode.',
        );
      return;
    }

    this._isRunning = true;
    // Match emitted chunks with events
    getGlobalScope().setContext('profile', { profiler_id: this._profilerId });

    this._startProfilerInstance();

    if (!this._profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS Profiler in manual lifecycle. Stopping.');
      this._resetProfilerInfo();
      return;
    }

    this._startPeriodicChunking();
  }

  /** Stop profiling; final chunk will be collected and sent. */
  public stop(): void {
    if (!this._isRunning) {
      DEBUG_BUILD && debug.log('[Profiling] No profile session running, stop() is a no-op.');
      return;
    }

    if (this._lifecycleMode === 'trace') {
      DEBUG_BUILD &&
        debug.log(
          '[Profiling] `profileLifecycle` is set to \"trace\"; manual start/stop calls are ignored in trace mode.',
        );
      return;
    }

    this._isRunning = false;
    if (this._chunkTimer) {
      clearTimeout(this._chunkTimer);
      this._chunkTimer = undefined;
    }

    // Collect whatever was currently recording
    this._collectCurrentChunk().catch(e => {
      DEBUG_BUILD && debug.error('[Profiling] Failed to collect current profile chunk on `stop()`:', e);
    });

    // Clear profiling context so subsequent events aren't marked as profiled
    getGlobalScope().setContext('profile', {});
  }

  /** Resets profiling info and running state. */
  private _resetProfilerInfo(): void {
    this._isRunning = false;
    getGlobalScope().setContext('profile', {});
  }

  /** Start a profiler instance if needed. */
  private _startProfilerInstance(): void {
    if (this._profiler?.stopped === false) {
      return;
    }
    const profiler = startJSSelfProfile();
    if (!profiler) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start JS Profiler.');
      return;
    }
    this._profiler = profiler;
  }

  /** Schedule periodic chunking while running. */
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

  /** Stop the current profiler, convert and send a profile chunk. */
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
