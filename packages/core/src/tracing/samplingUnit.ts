import type { Client } from '../client';
import { getClient, getCurrentScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import type { CoreOptions } from '../types/options';
import type { RequestEventData } from '../types/request';
import type { Session } from '../types/session';
import { debug } from '../utils/debug-logger';
import { parseSampleRate } from '../utils/parseSampleRate';
import { safeMathRandom } from '../utils/randomSafeContext';
import { safeCallback } from '../utils/safeCallback';

/**
 * PoC: session- and conversation-based sampling.
 *
 * A "sampling unit" is a group of telemetry that shares one sampling decision, for example a user
 * session or an AI conversation. The SDK makes one decision per unit:
 *
 * - Sampled unit: the SDK sends all spans and errors collected in it and records the replay and profile.
 * - Unsampled unit: the SDK sends no spans and records no replay or profile. Errors follow `sampleRate`.
 *
 * Logs and metrics are not sampled by the SDK today, so they are sent in both cases.
 * Telemetry outside of any unit follows the existing options (`tracesSampleRate`, `sampleRate`, ...).
 */

/** The data passed to a custom {@link SamplingUnitResolver}. */
export interface SamplingUnitContext {
  scope: Scope;
  isolationScope: Scope;
  /** The incoming request, if the SDK has one for the current isolation scope (server SDKs). */
  normalizedRequest?: RequestEventData;
}

/** Returns the key of the sampling unit the current telemetry belongs to, or nothing if there is none. */
export type SamplingUnitResolver = (context: SamplingUnitContext) => string | null | undefined;

/**
 * What the SDK samples by.
 *
 * - `'session'`: the session on the current or isolation scope (`browserSessionIntegration`).
 * - `'conversation'`: the conversation id set with `Sentry.setConversationId()`.
 * - a function: any key, for example a tenant id or a request header.
 */
export type SampleBy = 'session' | 'conversation' | SamplingUnitResolver;

export interface SamplingUnit {
  type: 'session' | 'conversation' | 'custom';
  key: string;
  /** Derived from the key. The same key gives the same value in every process and SDK. */
  sampleRand: number;
  /** The rate that applies to this unit. */
  sampleRate: number;
  /** `sampleRand < sampleRate` */
  sampled: boolean;
}

export type SamplingUnitOptions = Pick<CoreOptions, 'sampleBy' | 'telemetrySampleRate'>;

/**
 * A session keeps the `sample_rand` it was given first. This is `sampleRandFromKey(sid)`, unless the
 * session is first used inside a trace that was continued from another service. Then it takes over
 * that trace's `sample_rand`, so the session and the trace agree if both use the same rate.
 *
 * A session lifecycle that outlives the page (`tab`, cross-tab) has to persist this value next to the `sid`.
 */
const SESSION_SAMPLE_RANDS = new WeakMap<Session, number>();

/**
 * Deterministically maps a key to a `sample_rand` in `[0, 1)` with six decimal places.
 *
 * FNV-1a (32 bit) over the UTF-8 bytes of the key, followed by the MurmurHash3 finalizer. The finalizer
 * matters: without it, keys that only differ in their last characters (`conv_1`, `conv_2`) land close
 * to each other. Every SDK that takes part in a trace has to implement this identically.
 */
export function sampleRandFromKey(key: string): number {
  /* eslint-disable no-bitwise */
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  const unsigned = hash >>> 0;
  /* eslint-enable no-bitwise */

  // `sample_rand` is specified with six decimal places. We round down so the value stays below 1.
  return Math.floor((unsigned / 0x100000000) * 1e6) / 1e6;
}

function getSessionSampleRand(session: Session, scope: Scope): number {
  let sampleRand = SESSION_SAMPLE_RANDS.get(session);
  if (sampleRand === undefined) {
    const propagationContext = scope.getPropagationContext();
    if (propagationContext.parentSpanId) {
      sampleRand = propagationContext.sampleRand;
      DEBUG_BUILD &&
        debug.log(`[Sampling] Session ${session.sid} adopts sample_rand ${sampleRand} of the continued trace.`);
    } else {
      sampleRand = sampleRandFromKey(session.sid);
    }
    SESSION_SAMPLE_RANDS.set(session, sampleRand);
  }
  return sampleRand;
}

/** The configured units, in order. With several units, the first one that is available wins. */
function getSampleByList(options: SamplingUnitOptions): SampleBy[] {
  const { sampleBy } = options;
  return sampleBy ? (Array.isArray(sampleBy) ? sampleBy : [sampleBy]) : [];
}

/** Whether the options configure sampling by session, conversation or a custom key. */
export function hasSamplingUnits(options: SamplingUnitOptions | undefined): boolean {
  return !!options && options.telemetrySampleRate != null && !!options.sampleBy;
}

/** Whether the options configure sampling by session. */
export function isSamplingBySession(options: SamplingUnitOptions | undefined): boolean {
  return !!options && hasSamplingUnits(options) && getSampleByList(options).includes('session');
}

function makeUnit(type: SamplingUnit['type'], key: string, sampleRand: number, sampleRate: number): SamplingUnit {
  return { type, key, sampleRand, sampleRate, sampled: sampleRand < sampleRate };
}

/**
 * Resolves the sampling unit for the given scopes and its decision. With several configured units, the
 * first one that yields a key wins. Returns `undefined` if there is none: the existing options apply then.
 */
export function resolveSamplingUnit(
  options: SamplingUnitOptions | undefined,
  scope: Scope = getCurrentScope(),
  isolationScope: Scope = getIsolationScope(),
): SamplingUnit | undefined {
  if (!options || !hasSamplingUnits(options)) {
    return undefined;
  }

  const sampleRate = parseSampleRate(options.telemetrySampleRate);
  if (sampleRate === undefined) {
    return undefined;
  }

  for (const sampleBy of getSampleByList(options)) {
    if (sampleBy === 'session') {
      const session = scope.getSession() || isolationScope.getSession();
      if (session) {
        return makeUnit('session', session.sid, getSessionSampleRand(session, scope), sampleRate);
      }
    } else if (sampleBy === 'conversation') {
      const key = scope.getScopeData().conversationId || isolationScope.getScopeData().conversationId;
      if (key) {
        return makeUnit('conversation', key, sampleRandFromKey(key), sampleRate);
      }
    } else if (typeof sampleBy === 'function') {
      const key = safeCallback(
        DEBUG_BUILD ? 'The `sampleBy` callback threw an error, falling back to the next sampling unit:' : '',
        () =>
          sampleBy({
            scope,
            isolationScope,
            normalizedRequest: isolationScope.getScopeData().sdkProcessingMetadata.normalizedRequest,
          }),
        () => undefined,
      );
      if (key) {
        return makeUnit('custom', `${key}`, sampleRandFromKey(`${key}`), sampleRate);
      }
    }
  }

  return undefined;
}

/**
 * Called before a root span is sampled. Returns the sampling unit that decides for this trace, if the
 * SDK is the head of the trace. The trace then gets the `sample_rand` of the unit.
 *
 * Returns `undefined` if the trace is continued from another service or already has a decision. The
 * decision of the head of the trace applies then, as for every other trace.
 */
export function getSamplingUnitForNewTrace(
  options: SamplingUnitOptions,
  scope: Scope,
  isolationScope: Scope,
  parentSampled: boolean | undefined,
): SamplingUnit | undefined {
  if (!hasSamplingUnits(options)) {
    return undefined;
  }

  const propagationContext = scope.getPropagationContext();
  const unit = resolveSamplingUnit(options, scope, isolationScope);

  // An incoming parent, a decision or a frozen DSC on the propagation context mean this trace was sampled
  // before (by another service, or in the browser by an earlier root span on the same page).
  if (
    parentSampled !== undefined ||
    propagationContext.parentSpanId ||
    propagationContext.sampled !== undefined ||
    propagationContext.dsc
  ) {
    return undefined;
  }

  if (unit) {
    propagationContext.sampleRand = unit.sampleRand;
  }
  return unit;
}

/**
 * Returns the `sample_rand` for a trace that the SDK is about to start as its head:
 * the value of the current sampling unit, or a random value if there is none.
 */
export function getSampleRandForNewTrace(
  client: Client | undefined = getClient(),
  scope: Scope = getCurrentScope(),
  isolationScope: Scope = getIsolationScope(),
): number {
  return resolveSamplingUnit(client?.getOptions(), scope, isolationScope)?.sampleRand ?? safeMathRandom();
}
