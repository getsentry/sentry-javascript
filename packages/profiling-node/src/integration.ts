/* eslint-disable max-lines */

import {
  defineIntegration,
  getCurrentScope,
  getGlobalScope,
  getIsolationScope,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import type { Event, IntegrationFn, Profile, ProfileChunk, ProfilingIntegration, Span } from '@sentry/types';

import { LRUMap, consoleSandbox, logger, uuid4 } from '@sentry/utils';

import { CpuProfilerBindings } from './cpu_profiler';
import { DEBUG_BUILD } from './debug-build';
import { NODE_MAJOR, NODE_VERSION } from './nodeVersion';
import { MAX_PROFILE_DURATION_MS, maybeProfileSpan, stopSpanProfile } from './spanProfileUtils';
import type { RawThreadCpuProfile } from './types';
import { ProfileFormat } from './types';
import { PROFILER_THREAD_NAME } from './utils';

import {
  PROFILER_THREAD_ID_STRING,
  addProfilesToEnvelope,
  createProfilingChunkEvent,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  makeProfileChunkEnvelope,
} from './utils';

const CHUNK_INTERVAL_MS = 5000;
const PROFILE_MAP = new LRUMap<string, RawThreadCpuProfile>(50);
const PROFILE_TIMEOUTS: Record<string, NodeJS.Timeout> = {};

function addToProfileQueue(profile_id: string, profile: RawThreadCpuProfile): void {
  PROFILE_MAP.set(profile_id, profile);
}

function takeFromProfileQueue(profile_id: string): RawThreadCpuProfile | undefined {
  const profile = PROFILE_MAP.get(profile_id);
  PROFILE_MAP.remove(profile_id);
  return profile;
}

/**
 * Instruments the client to automatically invoke the profiler on span start and stop events.
 * @param client
 */
function setupAutomatedSpanProfiling(client: NodeClient): void {
  const spanToProfileIdMap = new WeakMap<Span, string>();

  client.on('spanStart', span => {
    if (span !== getRootSpan(span)) {
      return;
    }

    const profile_id = maybeProfileSpan(client, span);

    if (profile_id) {
      const options = client.getOptions();
      // Not intended for external use, hence missing types, but we want to profile a couple of things at Sentry that
      // currently exceed the default timeout set by the SDKs.
      const maxProfileDurationMs =
        (options._experiments && options._experiments['maxProfileDurationMs']) || MAX_PROFILE_DURATION_MS;

      if (PROFILE_TIMEOUTS[profile_id]) {
        global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete PROFILE_TIMEOUTS[profile_id];
      }

      // Enqueue a timeout to prevent profiles from running over max duration.
      const timeout = global.setTimeout(() => {
        DEBUG_BUILD &&
          logger.log('[Profiling] max profile duration elapsed, stopping profiling for:', spanToJSON(span).description);

        const profile = stopSpanProfile(span, profile_id);
        if (profile) {
          addToProfileQueue(profile_id, profile);
        }
      }, maxProfileDurationMs);

      // Unref timeout so it doesn't keep the process alive.
      timeout.unref();

      getCurrentScope().setContext('profile', { profile_id });
      spanToProfileIdMap.set(span, profile_id);
    }
  });

  client.on('spanEnd', span => {
    const profile_id = spanToProfileIdMap.get(span);

    if (profile_id) {
      if (PROFILE_TIMEOUTS[profile_id]) {
        global.clearTimeout(PROFILE_TIMEOUTS[profile_id]);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete PROFILE_TIMEOUTS[profile_id];
      }
      const profile = stopSpanProfile(span, profile_id);

      if (profile) {
        addToProfileQueue(profile_id, profile);
      }
    }
  });

  client.on('beforeEnvelope', (envelope): void => {
    // if not profiles are in queue, there is nothing to add to the envelope.
    if (!PROFILE_MAP.size) {
      return;
    }

    const profiledTransactionEvents = findProfiledTransactionsFromEnvelope(envelope);
    if (!profiledTransactionEvents.length) {
      return;
    }

    const profilesToAddToEnvelope: Profile[] = [];

    for (const profiledTransaction of profiledTransactionEvents) {
      const profileContext = profiledTransaction.contexts?.['profile'];
      const profile_id = profileContext?.['profile_id'];

      if (!profile_id) {
        throw new TypeError('[Profiling] cannot find profile for a transaction without a profile context');
      }

      // Remove the profile from the transaction context before sending, relay will take care of the rest.
      if (profileContext) {
        delete profiledTransaction.contexts?.['profile'];
      }

      const cpuProfile = takeFromProfileQueue(profile_id);
      if (!cpuProfile) {
        DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
        continue;
      }

      const profile = createProfilingEvent(client, cpuProfile, profiledTransaction);
      if (!profile) return;

      profilesToAddToEnvelope.push(profile);

      // @ts-expect-error profile does not inherit from Event
      client.emit('preprocessEvent', profile, {
        event_id: profiledTransaction.event_id,
      });
    }

    addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
  });
}

interface ChunkData {
  id: string;
  timer: NodeJS.Timeout | undefined;
  startTraceID: string;
}

class ContinuousProfiler {
  private _profilerId: string | undefined;
  private _client: NodeClient | undefined = undefined;
  private _chunkData: ChunkData | undefined = undefined;

  /**
   * Called when the profiler is attached to the client (continuous mode is enabled). If of the profiler
   * methods called before the profiler is initialized will result in a noop action with debug logs.
   * @param client
   */
  public initialize(client: NodeClient): void {
    this._client = client;

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
      DEBUG_BUILD && logger.log('[Profiling] Failed to start, sentry client was never attached to the profiler.');
      return;
    }

    // Flush any existing chunks before starting a new one.
    this._chunkStop();

    // Restart the profiler session
    this._setupSpanChunkInstrumentation();
    this._chunkStart();
  }

  /**
   * Stops the current chunk and flushes the profile to Sentry.
   * @returns void
   */
  public stop(): void {
    if (!this._client) {
      DEBUG_BUILD && logger.log('[Profiling] Failed to stop, sentry client was never attached to the profiler.');
      return;
    }
    this._chunkStop();
    this._teardownSpanChunkInstrumentation();
  }

  /**
   * Stop profiler and initializes profiling of the next chunk
   */
  private _chunkStart(): void {
    if (!this._client) {
      // The client is not attached to the profiler if the user has not enabled continuous profiling.
      // In this case, calling start() and stop() is a noop action.The reason this exists is because
      // it makes the types easier to work with and avoids users having to do null checks.
      DEBUG_BUILD && logger.log('[Profiling] Profiler was never attached to the client.');
      return;
    }
    if (this._chunkData) {
      DEBUG_BUILD &&
        logger.log(
          `[Profiling] Chunk with chunk_id ${this._chunkData.id} is still running, current chunk will be stopped a new chunk will be started.`,
        );
      this._chunkStop();
    }

    this._startChunkProfiling();
  }

  /**
   * Stops profiling of the current chunks and flushes the profile to Sentry
   */
  private _chunkStop(): void {
    if (this._chunkData?.timer) {
      global.clearTimeout(this._chunkData.timer);
      this._chunkData.timer = undefined;
      DEBUG_BUILD && logger.log(`[Profiling] Stopping profiling chunk: ${this._chunkData.id}`);
    }
    if (!this._client) {
      DEBUG_BUILD &&
        logger.log('[Profiling] Failed to collect profile, sentry client was never attached to the profiler.');
      return;
    }
    if (!this._chunkData?.id) {
      DEBUG_BUILD &&
        logger.log(`[Profiling] Failed to collect profile for: ${this._chunkData?.id}, the chunk_id is missing.`);
      return;
    }

    const profile = CpuProfilerBindings.stopProfiling(this._chunkData.id, ProfileFormat.CHUNK);

    if (!profile) {
      DEBUG_BUILD && logger.log(`[Profiling] _chunkiledStartTraceID to collect profile for: ${this._chunkData.id}`);
      return;
    }
    if (!this._profilerId) {
      DEBUG_BUILD &&
        logger.log('[Profiling] Profile chunk does not contain a valid profiler_id, this is a bug in the SDK');
      return;
    }
    if (profile) {
      DEBUG_BUILD && logger.log(`[Profiling] Sending profile chunk ${this._chunkData.id}.`);
    }

    DEBUG_BUILD && logger.log(`[Profiling] Profile chunk ${this._chunkData.id} sent to Sentry.`);
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
      DEBUG_BUILD && logger.log(`[Profiling] Failed to create profile chunk for: ${this._chunkData.id}`);
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
        logger.log('[Profiling] Failed to collect profile, sentry client was never attached to the profiler.');
      return;
    }

    const transport = this._client.getTransport();
    if (!transport) {
      DEBUG_BUILD && logger.log('[Profiling] No transport available to send profile chunk.');
      return;
    }

    const dsn = this._client.getDsn();
    const metadata = this._client.getSdkMetadata();
    const tunnel = this._client.getOptions().tunnel;

    const envelope = makeProfileChunkEnvelope(chunk, metadata?.sdk, tunnel, dsn);
    transport.send(envelope).then(null, reason => {
      DEBUG_BUILD && logger.error('Error while sending profile chunk envelope:', reason);
    });
  }

  /**
   * Starts the profiler and registers the flush timer for a given chunk.
   * @param chunk
   */
  private _startChunkProfiling(): void {
    const traceId =
      getCurrentScope().getPropagationContext().traceId || getIsolationScope().getPropagationContext().traceId;
    const chunk = this._initializeChunk(traceId);

    CpuProfilerBindings.startProfiling(chunk.id);
    DEBUG_BUILD && logger.log(`[Profiling] starting profiling chunk: ${chunk.id}`);

    chunk.timer = global.setTimeout(() => {
      DEBUG_BUILD && logger.log(`[Profiling] Stopping profiling chunk: ${chunk.id}`);
      this._chunkStop();
      DEBUG_BUILD && logger.log('[Profiling] Starting new profiling chunk.');
      setImmediate(this._chunkStart.bind(this));
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
        logger.log(
          '[Profiling] Failed to initialize span profiling, sentry client was never attached to the profiler.',
        );
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
    if (!event?.['contexts']?.['profile']) {
      return;
    }

    if (!event.contexts) {
      return;
    }

    // @ts-expect-error the trace fallback value is wrong, though it should never happen
    // and in case it does, we dont want to override whatever was passed initially.
    event.contexts['trace'] = {
      ...(event.contexts?.['trace'] ?? {}),
      data: {
        ...(event.contexts?.['trace']?.['data'] ?? {}),
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
  if (![16, 18, 20, 22].includes(NODE_MAJOR)) {
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[Sentry Profiling] You are using a Node.js version that does not have prebuilt binaries (${NODE_VERSION}).`,
        'The @sentry/profiling-node package only has prebuilt support for the following LTS versions of Node.js: 16, 18, 20, 22.',
        'To use the @sentry/profiling-node package with this version of Node.js, you will need to compile the native addon from source.',
        'See: https://github.com/getsentry/sentry-javascript/tree/develop/packages/profiling-node#building-the-package-from-source',
      );
    });
  }

  return {
    name: 'ProfilingIntegration',
    _profiler: new ContinuousProfiler(),
    setup(client: NodeClient) {
      DEBUG_BUILD && logger.log('[Profiling] Profiling integration setup.');
      const options = client.getOptions();

      const mode =
        (options.profilesSampleRate === undefined ||
          options.profilesSampleRate === null ||
          options.profilesSampleRate === 0) &&
        !options.profilesSampler
          ? 'continuous'
          : 'span';
      switch (mode) {
        case 'continuous': {
          DEBUG_BUILD && logger.log('[Profiling] Continuous profiler mode enabled.');
          this._profiler.initialize(client);
          break;
        }
        // Default to span profiling when no mode profiler mode is set
        case 'span':
        case undefined: {
          DEBUG_BUILD && logger.log('[Profiling] Span profiler mode enabled.');
          setupAutomatedSpanProfiling(client);
          break;
        }
        default: {
          DEBUG_BUILD && logger.warn(`[Profiling] Unknown profiler mode: ${mode}, profiler was not initialized`);
        }
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * We need this integration in order to send data to Sentry. We hook into the event processor
 * and inspect each event to see if it is a transaction event and if that transaction event
 * contains a profile on it's metadata. If that is the case, we create a profiling event envelope
 * and delete the profile from the transaction metadata.
 */
export const nodeProfilingIntegration = defineIntegration(_nodeProfilingIntegration);
