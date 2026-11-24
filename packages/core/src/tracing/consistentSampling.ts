import type { Client } from '../client';
import { getClient, getCurrentScope, getIsolationScope } from '../currentScopes';
import { DEBUG_BUILD } from '../debug-build';
import type { Scope } from '../scope';
import type { CoreOptions } from '../types/options';
import type { Session } from '../types/session';
import { debug } from '../utils/debug-logger';
import { safeMathRandom } from '../utils/randomSafeContext';
import { _getSpanForScope } from '../utils/spanOnScope';
import { spanIsSampled } from '../utils/spanUtils';

/**
 * PoC: consistent sampling, driven by the trace sampling decision.
 *
 * There is no new sample rate. `tracesSampleRate` and `tracesSampler` stay the one place where the sampling
 * decision is made. The `consistentSampling` option extends that decision:
 *
 * - `'trace'`: Errors captured in a sampled trace are always sent. In an unsampled trace they follow `sampleRate`.
 *   Logs and metrics have no sample rate of their own, so they are sent either way.
 * - `'session'`: In addition, the first trace of a session is sampled as usual, and every later trace the SDK
 *   starts in that session reuses its decision. Replay and profile rates are compared against the session's
 *   `sample_rand` instead of a new random number.
 * - `'conversation'`: In addition, every trace the SDK starts while a conversation id is set gets a `sample_rand`
 *   derived from that id. With one trace sample rate, all requests of a conversation get the same decision.
 */
export type ConsistentSampling = 'trace' | 'session' | 'conversation';

type ConsistentSamplingOptions = Pick<CoreOptions, 'consistentSampling'>;

/** The decision of the first trace of a session, which later traces of the session reuse. */
interface HeldSamplingDecision {
  sampled: boolean;
  /** The rate the decision was made with. Later traces report it as their `sample_rate`. */
  sampleRate: number | undefined;
}

/**
 * A session keeps the `sample_rand` it was given first. This is `sampleRandFromKey(sid)`, unless the session is
 * first used inside a trace that was continued from another service (a server-rendered pageload). Then it takes
 * over that trace's `sample_rand`.
 *
 * A session lifecycle that outlives the page (`tab`, cross-tab) has to persist this value and the held
 * decision next to the `sid`.
 */
const SESSION_SAMPLE_RANDS = new WeakMap<Session, number>();
const SESSION_DECISIONS = new WeakMap<Session, HeldSamplingDecision>();

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

function getSession(scope: Scope, isolationScope: Scope): Session | undefined {
  return scope.getSession() || isolationScope.getSession();
}

function getConversationId(scope: Scope, isolationScope: Scope): string | undefined {
  return scope.getScopeData().conversationId || isolationScope.getScopeData().conversationId;
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
 * Called before a root span is sampled.
 *
 * If the SDK is the head of the trace, the trace gets the `sample_rand` of its session or conversation.
 * For a session that already sampled a trace, this returns the decision of that first trace. The caller passes
 * it on as the parent decision, so it is inherited unless a `tracesSampler` deliberately deviates.
 *
 * A trace continued from another service keeps its own `sample_rand` and decision.
 */
export function getHeldSamplingDecision(
  options: ConsistentSamplingOptions,
  scope: Scope,
  isolationScope: Scope,
  parentSampled: boolean | undefined,
): HeldSamplingDecision | undefined {
  const { consistentSampling } = options;
  if (consistentSampling !== 'session' && consistentSampling !== 'conversation') {
    return undefined;
  }

  const propagationContext = scope.getPropagationContext();

  // An incoming parent, a decision or a frozen DSC on the propagation context mean this trace was sampled
  // before (by another service, or in the browser by an earlier root span on the same page).
  const isHeadOfTrace =
    parentSampled === undefined &&
    !propagationContext.parentSpanId &&
    propagationContext.sampled === undefined &&
    !propagationContext.dsc;

  if (consistentSampling === 'conversation') {
    const conversationId = getConversationId(scope, isolationScope);
    if (isHeadOfTrace && conversationId) {
      propagationContext.sampleRand = sampleRandFromKey(conversationId);
    }
    return undefined;
  }

  const session = getSession(scope, isolationScope);
  if (!session) {
    return undefined;
  }

  // Resolve the session's value before the head check, so a session that starts with a continued trace adopts it
  const sampleRand = getSessionSampleRand(session, scope);
  if (!isHeadOfTrace) {
    return undefined;
  }

  propagationContext.sampleRand = sampleRand;
  return SESSION_DECISIONS.get(session);
}

/**
 * Called after a root span was sampled. The first decision of a session is held for the rest of the session,
 * whoever made it: this SDK, or the service that started a continued trace.
 */
export function holdSamplingDecision(
  options: ConsistentSamplingOptions,
  scope: Scope,
  isolationScope: Scope,
  sampled: boolean,
  sampleRate: number | undefined,
): void {
  if (options.consistentSampling !== 'session') {
    return;
  }

  const session = getSession(scope, isolationScope);
  if (session && !SESSION_DECISIONS.has(session)) {
    SESSION_DECISIONS.set(session, { sampled, sampleRate });
  }
}

/**
 * Returns the `sample_rand` for a trace that the SDK is about to start as its head: the value of the current
 * session or conversation if the SDK samples consistently by one, or a random value.
 */
export function getSampleRandForNewTrace(
  client: Client | undefined = getClient(),
  scope: Scope = getCurrentScope(),
  isolationScope: Scope = getIsolationScope(),
): number {
  const consistentSampling = client?.getOptions().consistentSampling;

  if (consistentSampling === 'session') {
    const session = getSession(scope, isolationScope);
    if (session) {
      return getSessionSampleRand(session, scope);
    }
  } else if (consistentSampling === 'conversation') {
    const conversationId = getConversationId(scope, isolationScope);
    if (conversationId) {
      return sampleRandFromKey(conversationId);
    }
  }

  return safeMathRandom();
}

/**
 * Returns the `sample_rand` of the current session with `consistentSampling: 'session'`, otherwise `undefined`.
 *
 * Telemetry with a session sample rate of its own (replays, profiles) compares its rate against this value
 * instead of a new random number. With a rate at or below the trace sample rate, it is then only recorded in
 * sessions whose traces are sampled.
 */
export function getConsistentSessionSampleRand(
  options: ConsistentSamplingOptions | undefined,
  scope: Scope = getCurrentScope(),
  isolationScope: Scope = getIsolationScope(),
): number | undefined {
  if (options?.consistentSampling !== 'session') {
    return undefined;
  }
  const session = getSession(scope, isolationScope);
  return session && getSessionSampleRand(session, scope);
}

/**
 * Whether telemetry captured on the given scope belongs to a sampled trace: the active span is sampled, or,
 * without an active span, the current trace on the propagation context is (in the browser, the trace of the
 * current page after its pageload or navigation span ended).
 *
 * Always `false` without `consistentSampling`, so telemetry follows its own sample rate as before.
 */
export function isInSampledTrace(options: ConsistentSamplingOptions, scope: Scope): boolean {
  if (!options.consistentSampling) {
    return false;
  }
  const span = _getSpanForScope(scope);
  return span ? spanIsSampled(span) : scope.getPropagationContext().sampled === true;
}
