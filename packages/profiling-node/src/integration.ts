/* eslint-disable max-lines */
import type { Event, IntegrationFn, ProfileChunk, ProfilingIntegration } from '@sentry/core';
import { consoleSandbox, debug, defineIntegration, getCurrentScope, getGlobalScope, uuid4 } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import { CpuProfilerBindings, ProfileFormat } from '@sentry/node-cpu-profiler';
import { isMainThread } from 'worker_threads';
import { DEBUG_BUILD } from './debug-build';
import { NODE_MAJOR } from './nodeVersion';
import {
  createProfilingChunkEvent,
  makeProfileChunkEnvelope,
  PROFILER_THREAD_ID_STRING,
  PROFILER_THREAD_NAME,
} from './utils';

const CHUNK_INTERVAL_MS = 1000 * 60;
interface ChunkData {
  id: string;
  timer: NodeJS.Timeout | undefined;
  startTraceID: string;
}

class ContinuousProfiler {
  private _profilerId: string | undefined;
  private _client: NodeClient | undefined = undefined;
  private _chunkData: ChunkData | undefined = undefined;
  private _profileLifecycle: 'manual' | 'trace' | undefined = undefined;
  private _sampled: boolean | undefined = undefined;
  private _sessionSamplingRate: number | undefined = undefined;
  /**
   * Called when the profiler is attached to the client (continuous mode is enabled). If of the profiler
   * methods called before the profiler is initialized will result in a noop action with debug logs.
   * @param client
   */
  public initialize(client: NodeClient): void {
    if (!isMainThread) {
      DEBUG_BUILD &&
        debug.warn(
          '[Profiling] nodeProfilingIntegration() does not support worker threads — profiling will be disabled for this thread.',
        );
      return;
    }

    this._client = client;
    const options = client.getOptions();

    this._sessionSamplingRate = Math.random();
    this._sampled = this._sessionSamplingRate < (options.profileSessionSampleRate ?? 0);
    this._profileLifecycle = options.profileLifecycle ?? 'manual';

    this._setupSpanChunkInstrumentation();

    DEBUG_BUILD && debug.log(`[Profiling] Profiling mode is ${this._profileLifecycle}.`);

    switch (this._profileLifecycle) {
      case 'trace': {
        this._startTraceLifecycleProfiling();
        break;
      }
      case 'manual': {
        // Manual mode requires manual calls to profiler.startProfiler() and profiler.stopProfiler().
        break;
      }
      default: {
        DEBUG_BUILD &&
          debug.warn(`[Profiling] Unknown profiler mode: ${this._profileLifecycle}, profiler was not initialized`);
        break;
      }
    }

    // Attaches a listener to beforeSend which will add the threadId data to the event being sent.
    // This adds a constant overhead to all events being sent which could be improved to only attach
    // and detach the listener during a profiler session
    this._client.on('beforeSendEvent', this._onBeforeSendThreadContextAssignment.bind(this));
  }

  /**
   * Initializes a new profilerId session and schedules chunk profiling.
   * @returns void
   */
  public start(): void {
    if (!this._client) {
      DEBUG_BUILD && debug.log('[Profiling] Failed to start, Sentry client was never attached to the profiler.');
      return;
    }

    this._startProfiler();
  }

  /**
   * Stops the current chunk and flushes the profile to Sentry.
   */
  public stop(): void {
    this._stopProfiler();
  }

  private _startProfiler(): void {
    if (this._chunkData !== undefined) {
      DEBUG_BUILD && debug.log('[Profiling] Profile session already running, no-op.');
      return;
    }

    if (!this._sampled) {
      DEBUG_BUILD && debug.log('[Profiling] Profile session not sampled, no-op.');
      return;
    }

    if (this._profileLifecycle === 'trace') {
      DEBUG_BUILD &&
        debug.log(
          '[Profiling] You are using the trace profile lifecycle, manual calls to profiler.startProfiler() and profiler.stopProfiler() will be ignored.',
        );
      return;
    }

    this._startChunkProfiling();
  }

  private _stopProfiler(): void {
    if (this._profileLifecycle === 'trace') {
      DEBUG_BUILD &&
        debug.log(
          '[Profiling] You are using the trace profile lifecycle, manual calls to profiler.startProfiler() and profiler.stopProfiler() will be ignored.',
        );
      return;
    }

    if (!this._chunkData) {
      DEBUG_BUILD && debug.log('[Profiling] No profile session running, no-op.');
      return;
    }

    this._stopChunkProfiling();
  }

  /**
   * Starts trace lifecycle profiling. Profiling will remain active as long as there is an active span.
   */
  private _startTraceLifecycleProfiling(): void {
    if (!this._sampled) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Profile session not sampled, trace lifecycle profiling will not be started.');
      return;
    }

    if (!this._client) {
      DEBUG_BUILD &&
        debug.log(
          '[Profiling] Failed to start trace lifecycle profiling, sentry client was never attached to the profiler.',
        );
      return;
    }

    let activeSpanCounter = 0;
    this._client.on('spanStart', _span => {
      if (activeSpanCounter === 0) {
        this._startChunkProfiling();
      }
      activeSpanCounter++;
    });

    this._client.on('spanEnd', _span => {
      if (activeSpanCounter === 1) {
        this._stopChunkProfiling();
      }
      activeSpanCounter--;
    });
  }

  /**
   * Stop profiler and initializes profiling of the next chunk
   */
  private _restartChunkProfiling(): void {
    if (!this._client) {
      // The client is not attached to the profiler if the user has not enabled continuous profiling.
      // In this case, calling start() and stop() is a noop action.The reason this exists is because
      // it makes the types easier to work with and avoids users having to do null checks.
      DEBUG_BUILD && debug.log('[Profiling] Profiler was never attached to the client.');
      return;
    }

    if (this._chunkData) {
      DEBUG_BUILD &&
        debug.log(
          `[Profiling] Chunk with chunk_id ${this._chunkData.id} is still running, current chunk will be stopped a new chunk will be started.`,
        );
      this._stopChunkProfiling();
    }

    this._startChunkProfiling();
  }

  /**
   * Stops profiling of the current chunks and flushes the profile to Sentry
   */
  private _stopChunkProfiling(): void {
    if (!this._chunkData) {
      DEBUG_BUILD && debug.log('[Profiling] No chunk data found, no-op.');
      return;
    }

    if (this._chunkData?.timer) {
      global.clearTimeout(this._chunkData.timer);
      this._chunkData.timer = undefined;
      DEBUG_BUILD && debug.log(`[Profiling] Stopping profiling chunk: ${this._chunkData.id}`);
    }

    if (!this._client) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Failed to collect profile, sentry client was never attached to the profiler.');
      this._resetChunkData();
      return;
    }

    if (!this._chunkData?.id) {
      DEBUG_BUILD &&
        debug.log(`[Profiling] Failed to collect profile for: ${this._chunkData?.id}, the chunk_id is missing.`);
      this._resetChunkData();
      return;
    }

    const profile = CpuProfilerBindings.stopProfiling(this._chunkData.id, ProfileFormat.CHUNK);

    if (!profile) {
      DEBUG_BUILD && debug.log(`[Profiling] Failed to collect profile for: ${this._chunkData.id}`);
      this._resetChunkData();
      return;
    }

    if (!this._profilerId) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Profile chunk does not contain a valid profiler_id, this is a bug in the SDK');
      this._resetChunkData();
      return;
    }
    if (profile) {
      DEBUG_BUILD && debug.log(`[Profiling] Sending profile chunk ${this._chunkData.id}.`);
    }

    DEBUG_BUILD && debug.log(`[Profiling] Profile chunk ${this._chunkData.id} sent to Sentry.`);
    const chunk = createProfilingChunkEvent(
      this._client,
      this._client.getOptions(),
      profile,
      this._client.getSdkMetadata()?.sdk,
      {
        chunk_id: this._chunkData.id,
        trace_id: this._chunkData.startTraceID,
        profiler_id: this._profilerId,
      },
    );

    if (!chunk) {
      DEBUG_BUILD && debug.log(`[Profiling] Failed to create profile chunk for: ${this._chunkData.id}`);
      this._resetChunkData();
      return;
    }

    this._flush(chunk);
    // Depending on the profile and stack sizes, stopping the profile and converting
    // the format may negatively impact the performance of the application. To avoid
    // blocking for too long, enqueue the next chunk start inside the next macrotask.
    // clear current chunk
    this._resetChunkData();
  }

  /**
   * Flushes the profile chunk to Sentry.
   * @param chunk
   */
  private _flush(chunk: ProfileChunk): void {
    if (!this._client) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Failed to collect profile, sentry client was never attached to the profiler.');
      return;
    }

    const transport = this._client.getTransport();
    if (!transport) {
      DEBUG_BUILD && debug.log('[Profiling] No transport available to send profile chunk.');
      return;
    }

    const dsn = this._client.getDsn();
    const metadata = this._client.getSdkMetadata();
    const tunnel = this._client.getOptions().tunnel;

    const envelope = makeProfileChunkEnvelope('node', chunk, metadata?.sdk, tunnel, dsn);
    transport.send(envelope).then(null, reason => {
      DEBUG_BUILD && debug.error('Error while sending profile chunk envelope:', reason);
    });
  }

  /**
   * Starts the profiler and registers the flush timer for a given chunk.
   * @param chunk
   */
  private _startChunkProfiling(): void {
    if (this._chunkData) {
      DEBUG_BUILD && debug.log('[Profiling] Chunk is already running, no-op.');
      return;
    }

    const traceId = getCurrentScope().getPropagationContext().traceId;
    const chunk = this._initializeChunk(traceId);

    CpuProfilerBindings.startProfiling(chunk.id);
    DEBUG_BUILD && debug.log(`[Profiling] starting profiling chunk: ${chunk.id}`);

    chunk.timer = global.setTimeout(() => {
      DEBUG_BUILD && debug.log(`[Profiling] Stopping profiling chunk: ${chunk.id}`);
      this._stopChunkProfiling();
      DEBUG_BUILD && debug.log('[Profiling] Starting new profiling chunk.');
      setImmediate(this._restartChunkProfiling.bind(this));
    }, CHUNK_INTERVAL_MS);

    // Unref timeout so it doesn't keep the process alive.
    chunk.timer.unref();
  }

  /**
   * Attaches profiling information to spans that were started
   * during a profiling session.
   */
  private _setupSpanChunkInstrumentation(): void {
    if (!this._client) {
      DEBUG_BUILD &&
        debug.log('[Profiling] Failed to initialize span profiling, sentry client was never attached to the profiler.');
      return;
    }

    this._profilerId = uuid4();
    getGlobalScope().setContext('profile', {
      profiler_id: this._profilerId,
    });
  }

  /**
   * Assigns thread_id and thread name context to a profiled event if there is an active profiler session
   */
  private _onBeforeSendThreadContextAssignment(event: Event): void {
    if (!this._client || !this._profilerId) return;
    this._assignThreadIdContext(event);
  }

  /**
   * Clear profiling information from global context when a profile is not running.
   */
  private _teardownSpanChunkInstrumentation(): void {
    this._profilerId = undefined;
    const globalScope = getGlobalScope();
    globalScope.setContext('profile', {});
  }

  /**
   * Initializes new profile chunk metadata
   */
  private _initializeChunk(traceId: string): ChunkData {
    this._chunkData = {
      id: uuid4(),
      startTraceID: traceId,
      timer: undefined,
    };
    return this._chunkData;
  }

  /**
   * Assigns thread_id and thread name context to a profiled event.
   */
  private _assignThreadIdContext(event: Event): void {
    if (!event?.contexts?.profile) {
      return;
    }

    if (!event.contexts) {
      return;
    }

    // @ts-expect-error the trace fallback value is wrong, though it should never happen
    // and in case it does, we dont want to override whatever was passed initially.
    event.contexts.trace = {
      ...(event.contexts?.trace ?? {}),
      data: {
        ...(event.contexts?.trace?.data ?? {}),
        ['thread.id']: PROFILER_THREAD_ID_STRING,
        ['thread.name']: PROFILER_THREAD_NAME,
      },
    };
  }

  /**
   * Resets the current chunk state.
   */
  private _resetChunkData(): void {
    this._chunkData = undefined;
  }
}

/** Exported only for tests. */
export const _nodeProfilingIntegration = ((): ProfilingIntegration<NodeClient> => {
  if (![16, 18, 20, 22, 24, 26].includes(NODE_MAJOR)) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry Profiling] You are using a Node.js version that does not have prebuilt binaries (${NODE_MAJOR}).`,
        'The @sentry/profiling-node package only has prebuilt support for the following LTS versions of Node.js: 16, 18, 20, 22, 24, 26.',
        'To use the @sentry/profiling-node package with this version of Node.js, you will need to compile the native addon from source.',
        'See: https://github.com/getsentry/sentry-javascript/tree/develop/packages/profiling-node#building-the-package-from-source',
      );
    });
  }

  return {
    name: 'ProfilingIntegration' as const,
    _profiler: new ContinuousProfiler(),
    setup(client: NodeClient) {
      DEBUG_BUILD && debug.log('[Profiling] Profiling integration setup.');
      this._profiler.initialize(client);
      return;
    },
  };
}) satisfies IntegrationFn;

export const nodeProfilingIntegration = defineIntegration(_nodeProfilingIntegration);
