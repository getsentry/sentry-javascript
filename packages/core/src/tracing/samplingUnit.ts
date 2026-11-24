import type { Client } from '../client';
import { getClient, getCurrentScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import type { CoreOptions } from '../types/options';
import type { Session } from '../types/session';
import { debug } from '../utils/debug-logger';
import { parseSampleRate } from '../utils/parseSampleRate';
import { safeMathRandom } from '../utils/randomSafeContext';

/**
 * PoC: session- and conversation-based sampling.
 *
 * A "sampling unit" is a group of telemetry that shares one sampling decision, for example a user
 * session or an AI conversation. The SDK makes one decision per unit:
 *
 * - Sampled unit: the SDK sends all spans, logs, metrics, errors, replays and profiles collected in it.
 * - Unsampled unit: the SDK sends none of them, except errors, which follow `sampleRate`.
 *
 * Telemetry outside of any unit follows the existing options (`tracesSampleRate`, `sampleRate`, ...).
 */

export interface SamplingUnit {
  type: 'session' | 'conversation';
  key: string;
  /** Derived from the key. The same key gives the same value in every process and SDK. */
  sampleRand: number;
  /** The rate that applies to this unit. */
  sampleRate: number;
  /** `sampleRand < sampleRate` */
  sampled: boolean;
}

export type SamplingUnitOptions = Pick<CoreOptions, 'sessionSampleRate' | 'conversationSampleRate'>;

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

/** The configured units and their rates. With several units, the first one that is available wins. */
function getUnitRates(options: SamplingUnitOptions): Array<[SamplingUnit['type'], number]> {
  const rates: Array<[SamplingUnit['type'], number]> = [];

  const sessionSampleRate = parseSampleRate(options.sessionSampleRate);
  if (sessionSampleRate !== undefined) {
    rates.push(['session', sessionSampleRate]);
  }

  const conversationSampleRate = parseSampleRate(options.conversationSampleRate);
  if (conversationSampleRate !== undefined) {
    rates.push(['conversation', conversationSampleRate]);
  }

  return rates;
}

/** Whether the options configure sampling by session or conversation. */
export function hasSamplingUnits(options: SamplingUnitOptions | undefined): boolean {
  return !!options && (options.sessionSampleRate != null || options.conversationSampleRate != null);
}

/** Whether the options configure sampling by session. */
export function isSamplingBySession(options: SamplingUnitOptions | undefined): boolean {
  return options?.sessionSampleRate != null;
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

  for (const [type, sampleRate] of getUnitRates(options)) {
    if (type === 'session') {
      const session = scope.getSession() || isolationScope.getSession();
      if (session) {
        return makeUnit('session', session.sid, getSessionSampleRand(session, scope), sampleRate);
      }
    } else {
      const key = scope.getScopeData().conversationId || isolationScope.getScopeData().conversationId;
      if (key) {
        return makeUnit('conversation', key, sampleRandFromKey(key), sampleRate);
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

/**
 * The decision for logs and metrics. They have no sample rate of their own, so outside of a sampling unit
 * they are always sent. A returned `sampleRate` below 1 has to be sent along as `sentry.client_sample_rate`,
 * so Sentry can extrapolate.
 */
export function sampleTelemetry(
  client: Client,
  scope: Scope,
  isolationScope: Scope = getIsolationScope(),
): { sampled: boolean; sampleRate?: number } {
  const unit = resolveSamplingUnit(client.getOptions(), scope, isolationScope);
  return unit ? { sampled: unit.sampled, sampleRate: unit.sampleRate } : { sampled: true };
}
