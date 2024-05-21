import { defineIntegration, getCurrentScope, getIsolationScope, getRootSpan, spanToJSON } from '@sentry/core';
import type { NodeClient } from '@sentry/node';
import type { Integration, IntegrationFn, Span, Profile, ProfileChunk } from '@sentry/types';

import { logger, timestampInSeconds, uuid4 } from '@sentry/utils';

import { CpuProfilerBindings } from './cpu_profiler';
import { DEBUG_BUILD } from './debug-build';
import { MAX_PROFILE_DURATION_MS, maybeProfileSpan, stopSpanProfile } from './spanProfileUtils';
import type { RawThreadCpuProfile } from './types';

import {
  addProfilesToEnvelope,
  createProfilingChunkEvent,
  createProfilingEvent,
  findProfiledTransactionsFromEnvelope,
  makeProfileChunkEnvelope,
} from './utils';

const MAX_PROFILE_QUEUE_LENGTH = 50;
const PROFILE_QUEUE: RawThreadCpuProfile[] = [];
const PROFILE_TIMEOUTS: Record<string, NodeJS.Timeout> = {};

function addToProfileQueue(profile: RawThreadCpuProfile): void {
  PROFILE_QUEUE.push(profile);

  // We only want to keep the last n profiles in the queue.
  if (PROFILE_QUEUE.length > MAX_PROFILE_QUEUE_LENGTH) {
    PROFILE_QUEUE.shift();
  }
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

    const profile_id = maybeProfileSpan(client, span, undefined);

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
          addToProfileQueue(profile);
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
        addToProfileQueue(profile);
      }
    }
  });

  client.on('beforeEnvelope', (envelope): void => {
    // if not profiles are in queue, there is nothing to add to the envelope.
    if (!PROFILE_QUEUE.length) {
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

      // We need to find both a profile and a transaction event for the same profile_id.
      const profileIndex = PROFILE_QUEUE.findIndex(p => p.profile_id === profile_id);
      if (profileIndex === -1) {
        DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
        continue;
      }

      const cpuProfile = PROFILE_QUEUE[profileIndex];
      if (!cpuProfile) {
        DEBUG_BUILD && logger.log(`[Profiling] Could not retrieve profile for transaction: ${profile_id}`);
        continue;
      }

      // Remove the profile from the queue.
      PROFILE_QUEUE.splice(profileIndex, 1);
      const profile = createProfilingEvent(client, cpuProfile, profiledTransaction);

      if (client.emit && profile) {
        const integrations =
          client['_integrations'] && client['_integrations'] !== null && !Array.isArray(client['_integrations'])
            ? Object.keys(client['_integrations'])
            : undefined;

        // @ts-expect-error bad overload due to unknown event
        client.emit('preprocessEvent', profile, {
          event_id: profiledTransaction.event_id,
          integrations,
        });
      }

      if (profile) {
        profilesToAddToEnvelope.push(profile);
      }
    }

    addProfilesToEnvelope(envelope, profilesToAddToEnvelope);
  });
}

class ContinuousProfiler {
  private _profilerId = uuid4();
  private _client: NodeClient | undefined = undefined;

  private _chunkId: string | undefined = undefined;
  private _chunkTimer: NodeJS.Timeout | undefined = undefined;
  private _chunkIntervalMS = 5000;
  private _chunkStartTimestampMS: number | undefined = undefined;
  private _chunkStartTraceID: string | undefined = undefined;

  /**
   * Called when the profiler is attached to the client (continuous mode is enabled). If of the profiler
   * methods called before the profiler is initialized will result in a noop action with debug logs.
   * @param client
   */
  public initialize(client: NodeClient): void {
    this._client = client;
  }

  /**
   * Recursively schedules chunk profiling to start and stop at a set interval.
   * Once the user calls stop(), the current chunk will be stopped and flushed to Sentry and no new chunks will
   * will be started. To restart continuous mode after calling stop(), the user must call start() again.
   * @returns void
   */
  public start(): void {
    if (!this._client) {
      // The client is not attached to the profiler in the event that users did not pass the profilerMode: "continuous"
      // to the SDK init. In this case, calling start() and stop() is a noop action. The reason this exists is because
      // it makes the types easier to work with and avoids users having to do null checks.
      DEBUG_BUILD && logger.log('[Profiling] Profiler was never attached to the client.');
      return;
    }
    if (this._chunkId || this._chunkTimer) {
      DEBUG_BUILD &&
        logger.log(`[Profiling] Chunk with chunk_id ${this._chunkId} is still running, current chunk will be stopped a new chunk will be started.`);
      this.stop();
    }

    const scope = getCurrentScope();
    const isolationScope = getIsolationScope();

    // Extract the trace_id from the current scope and assign start_timestamp as well as the new chunk_id.
    this._chunkId = uuid4();
    this._chunkStartTraceID = {
      ...isolationScope.getPropagationContext(),
      ...scope.getPropagationContext(),
    }.traceId;
    this._chunkStartTimestampMS = timestampInSeconds();

    CpuProfilerBindings.startProfiling(this._chunkId);
    DEBUG_BUILD && logger.log(`[Profiling] starting profiling chunk: ${this._chunkId}`);

    this._chunkTimer = global.setTimeout(() => {
      DEBUG_BUILD && logger.log(`[Profiling] Stopping profiling chunk: ${this._chunkId}`);
      this.stop();
      DEBUG_BUILD && logger.log('[Profiling] Starting new profiling chunk.');
      setImmediate(this.start.bind(this));
    }, this._chunkIntervalMS);

    // Unref timeout so it doesn't keep the process alive.
    this._chunkTimer.unref();
  }

  /**
   * Stops the current chunk and flushes the profile to Sentry.
   * @returns void
   */
  public stop(): void {
    if (!this._client) {
      DEBUG_BUILD &&
        logger.log('[Profiling] Failed to collect profile, sentry client was never attached to the profiler.');
      return;
    }
    if (!this._chunkId) {
      DEBUG_BUILD &&
        logger.log(`[Profiling] Failed to collect profile for: ${this._chunkId}, the chunk_id is missing.`);
      return;
    }
    if (this._chunkTimer) {
      global.clearTimeout(this._chunkTimer);
    }
    DEBUG_BUILD && logger.log(`[Profiling] Stopping profiling chunk: ${this._chunkId}`);

    const profile = CpuProfilerBindings.stopProfiling(this._chunkId);
    if (!profile || !this._chunkStartTimestampMS) {
      DEBUG_BUILD && logger.log(`[Profiling] _chunkiledStartTraceID to collect profile for: ${this._chunkId}`);
      return;
    }
    if (profile) {
      DEBUG_BUILD && logger.log(`[Profiling] Sending profile chunk ${this._chunkId}.`);
    }

    DEBUG_BUILD && logger.log(`[Profiling] Profile chunk ${this._chunkId} sent to Sentry.`);
    const chunk = createProfilingChunkEvent(
      this._chunkStartTimestampMS,
      this._client,
      this._client.getOptions(),
      profile,
      {
        chunk_id: this._chunkId,
        trace_id: this._chunkStartTraceID,
        profiler_id: this._profilerId,
      },
    );

    if (!chunk) {
      DEBUG_BUILD && logger.log(`[Profiling] Failed to create profile chunk for: ${this._chunkId}`);
      this._reset();
      return;
    }

    this._flush(chunk);
    // Depending on the profile and stack sizes, stopping the profile and converting
    // the format may negatively impact the performance of the application. To avoid
    // blocking for too long, enqueue the next chunk start inside the next macrotask.
    // clear current chunk
    this._reset();
  }

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

    const envelope = makeProfileChunkEnvelope(chunk, metadata?.sdk, tunnel, dsn)
    transport.send(envelope).then(null, reason => {
      DEBUG_BUILD && logger.error('Error while sending profile chunk envelope:', reason);
    });
  }

  /**
   * Resets the current chunk state.
   */
  private _reset(): void {
    this._chunkId = undefined;
    this._chunkTimer = undefined;
    this._chunkStartTimestampMS = undefined;
    this._chunkStartTraceID = undefined;
  }
}

interface ProfilingIntegration extends Integration {
  profiler: ContinuousProfiler;
}

/** Exported only for tests. */
export const _nodeProfilingIntegration = ((): ProfilingIntegration => {
  return {
    name: 'ProfilingIntegration',
    profiler: new ContinuousProfiler(),
    setup(client: NodeClient) {
      DEBUG_BUILD && logger.log('[Profiling] Profiling integration setup.');
      const options = client.getOptions();
      switch (options.profilerMode) {
        case 'continuous': {
          DEBUG_BUILD && logger.log('[Profiling] Continuous profiler mode enabled.');
          this.profiler.initialize(client);
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
          DEBUG_BUILD &&
            logger.warn(`[Profiling] Unknown profiler mode: ${options.profilerMode}, profiler was not initialized`);
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
