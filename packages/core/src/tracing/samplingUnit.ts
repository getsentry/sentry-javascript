import type { Client } from '../client';
import { getClient, getCurrentScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import type { CoreOptions } from '../types/options';
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
 * - Unsampled unit: spans fall back to `tracesSampleRate` and errors to `sampleRate`. No replay or profile.
 *
 * The fallback rates are corrected, so that the SDK sends the same share of spans and errors as without
 * sampling units (see {@link getFallbackSampleRate}). Spans report `max(unitRate, tracesSampleRate)`.
 *
 * Logs and metrics are not sampled by the SDK today, so they are sent in both cases.
 * Telemetry outside of any unit follows the existing options (`tracesSampleRate`, `sampleRate`, ...).
 */

export interface SamplingUnit {
  type: 'session' | 'conversation';
  key: string;
  /** Derived from the key. The same key gives the same value in every process and SDK. */
  sampleRand: number;
  /** The rate that applies to this unit. */
  sampleRate: number;
  /** `sampleRand < sampleRate`. Everything collected in a sampled unit is sent. */
  sampled: boolean;
}

export type SamplingUnitOptions = Pick<
  CoreOptions,
  'sessionSampleRate' | 'conversationSampleRate' | 'provideConversationId'
>;

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

/**
 * Asks `provideConversationId` for the conversation of the incoming request. The request is known before the
 * root span starts, so the conversation can decide for the whole trace.
 */
function getProvidedConversationId(options: SamplingUnitOptions, isolationScope: Scope): string | undefined {
  const { provideConversationId } = options;
  const { normalizedRequest } = isolationScope.getScopeData().sdkProcessingMetadata;
  if (!provideConversationId || !normalizedRequest) {
    return undefined;
  }

  return safeCallback(
    DEBUG_BUILD ? 'The `provideConversationId` callback threw an error:' : '',
    () => provideConversationId(normalizedRequest) || undefined,
    () => undefined,
  );
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
      const key =
        scope.getScopeData().conversationId ||
        isolationScope.getScopeData().conversationId ||
        getProvidedConversationId(options, isolationScope);
      if (key) {
        return makeUnit('conversation', key, sampleRandFromKey(key), sampleRate);
      }
    }
  }

  return undefined;
}

/**
 * The rate for the fallback decision in an unsampled unit, for telemetry with its own sample rate.
 *
 * Applying the plain rate would send more than before: with a unit rate of 0.1 and `tracesSampleRate: 0.2`,
 * 10% + 90% * 0.2 = 28% of all spans. The corrected rate keeps the total at the telemetry's own rate:
 *
 *   unitRate + (1 - unitRate) * fallback = sampleRate
 *
 * If the unit rate is the higher one, there is nothing left for the fallback, and the total is the unit rate.
 */
export function getFallbackSampleRate(sampleRate: number, unitRate: number): number {
  return sampleRate > unitRate ? (sampleRate - unitRate) / (1 - unitRate) : 0;
}

/**
 * The rate to sample an error with: all errors of a sampled unit are sent, errors of an unsampled unit
 * follow the corrected `sampleRate`. Without a unit, `sampleRate` applies as is.
 */
export function getErrorSampleRate(sampleRate: number, unit: SamplingUnit | undefined): number {
  return !unit ? sampleRate : unit.sampled ? 1 : getFallbackSampleRate(sampleRate, unit.sampleRate);
}

/**
 * The `sample_rand` of a trace that the SDK starts in the given unit.
 *
 * - Sampled unit: the value of the unit, which is below the unit's rate.
 * - Unsampled unit: a value between the unit's rate and 1, drawn for each trace.
 *
 * This way one comparison makes both decisions, see {@link sampleSpanInUnit}.
 */
function getTraceSampleRand(unit: SamplingUnit, currentSampleRand?: number): number {
  if (unit.sampled) {
    return unit.sampleRand;
  }
  // A value that is already in the range was drawn for this trace before. We keep it.
  if (currentSampleRand !== undefined && currentSampleRand >= unit.sampleRate) {
    return currentSampleRand;
  }
  return unit.sampleRate + safeMathRandom() * (1 - unit.sampleRate);
}

/**
 * Makes the sampling decision for a root span in a sampling unit, if the SDK is the head of the trace.
 * `traceSampleRate` is the rate that `tracesSampler` or `tracesSampleRate` give for this span.
 *
 * The span is sampled if `sampleRand < max(unitRate, traceSampleRate)`:
 * - In a sampled unit, `sampleRand` is below the unit rate, so every span is sampled.
 * - In an unsampled unit, `sampleRand` is spread between the unit rate and 1, so a span is sampled with the
 *   corrected fallback rate `(traceSampleRate - unitRate) / (1 - unitRate)`.
 *
 * Every span has the same overall chance to be sent, whichever way it took: `max(unitRate, traceSampleRate)`.
 * This is the sample rate the span reports, so Sentry extrapolates correctly, and
 * `sample_rand < sample_rate <=> sampled` holds for downstream services.
 */
export function sampleSpanInUnit(
  unit: SamplingUnit,
  sampleRand: number,
  traceSampleRate: number | undefined,
): [sampled: boolean, sampleRate: number, localSampleRateWasApplied: boolean] {
  const sampleRate = Math.max(unit.sampleRate, traceSampleRate || 0);
  const sampled = sampleRand < sampleRate;

  DEBUG_BUILD &&
    debug.log(
      `[Sampling] Root span is ${sampled ? 'sampled' : 'not sampled'}: ${unit.type} ${unit.key} is ${
        unit.sampled ? 'sampled' : 'not sampled'
      } (rate ${unit.sampleRate}), reported sample rate is ${sampleRate}.`,
    );

  return [sampled, sampleRate, true];
}

/**
 * Called before a root span is sampled. Returns the sampling unit that this trace belongs to, if the
 * SDK is the head of the trace. The trace then gets its `sample_rand` from the unit.
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
    propagationContext.sampleRand = getTraceSampleRand(unit, propagationContext.sampleRand);
  }
  return unit;
}

/**
 * Returns the `sample_rand` for a trace that the SDK is about to start as its head. In a sampled unit this is
 * the value of the unit, otherwise a random value (see {@link getTraceSampleRand}).
 */
export function getSampleRandForNewTrace(
  client: Client | undefined = getClient(),
  scope: Scope = getCurrentScope(),
  isolationScope: Scope = getIsolationScope(),
): number {
  const unit = resolveSamplingUnit(client?.getOptions(), scope, isolationScope);
  return unit ? getTraceSampleRand(unit) : safeMathRandom();
}
