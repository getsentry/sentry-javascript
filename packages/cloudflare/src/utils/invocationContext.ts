import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Scope } from '@sentry/core';
import { debug, getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import type { ExecutionContextCompat } from '../executionContext';
import { getOriginalWaitUntil } from '../flush';

/**
 * State owned by a single invocation (request, RPC call, cron, ...).
 *
 * A cached client (`cacheClient`) is shared by all invocations running in the same
 * isolate, so anything invocation-owned must not live on the client: two overlapping
 * requests would otherwise overwrite each other's state (e.g. the execution context
 * used to register eager flushes) and the earlier invocation's envelopes would be
 * suspended when the later invocation ends.
 *
 * The state rides on the invocation's forked isolation scope, which the async
 * context strategy (AsyncLocalStorage) hands back for exactly the async context that
 * owns the invocation — including detached continuations created inside it. A symbol
 * key keeps it off `Scope.clone()` and out of serialized event data.
 */
export interface InvocationState {
  /**
   * The execution context of the invocation that owns this scope. Eager envelope
   * sends are registered with this context's `waitUntil`, so they are attributed to
   * the invocation that captured the data even when invocations overlap.
   */
  readonly ctx: ExecutionContextCompat | undefined;
  /**
   * Set on the client's `flush` hook, the invocation's natural flush point.
   * Captures before it are drained by that flush; captures after it (in
   * `waitUntil` work or detached continuations) have no later flush to ride and
   * are delivered eagerly.
   */
  flushPointReached?: boolean;
  /**
   * `ctx.waitUntil` resolved once for this invocation (see `getInvocationWaitUntil`).
   * `null` once resolved to "no usable waitUntil".
   */
  waitUntil?: ExecutionContext['waitUntil'] | null;
}

const INVOCATION_STATE: unique symbol = Symbol('sentryInvocationState');

/**
 * Returns the invocation's original (un-instrumented) `waitUntil`, bound to its context,
 * resolving it on first use and caching it on the state. Reading `ctx.waitUntil` on a
 * native `ExecutionContext`/`DurableObjectState` goes through the runtime's property
 * getter every time; one read per invocation is enough.
 */
export function getInvocationWaitUntil(state: InvocationState): ExecutionContext['waitUntil'] | undefined {
  if (state.waitUntil === undefined) {
    const ctx = state.ctx;
    let resolved: ExecutionContext['waitUntil'] | null = null;
    try {
      const original = ctx && getOriginalWaitUntil(ctx);
      resolved = original ? original.bind(ctx) : null;
    } catch {
      // Accessing `waitUntil` can throw on foreign or already-torn-down contexts.
    }
    state.waitUntil = resolved;
  }
  return state.waitUntil ?? undefined;
}

type ScopeWithInvocationState = Scope & {
  [INVOCATION_STATE]?: InvocationState;
};

/**
 * Attaches invocation state to a forked isolation scope. Only meaningful on a scope
 * that outlives nothing but this invocation — never attach to the default isolation
 * scope, which is shared by every invocation in the isolate.
 */
export function setInvocationState(scope: Scope, state: InvocationState): void {
  if (scope === getDefaultIsolationScope()) {
    DEBUG_BUILD &&
      debug.warn(
        '[Sentry] Cannot track this invocation. Telemetry captured after the invocation ends may not be delivered.',
      );
    return;
  }

  (scope as ScopeWithInvocationState)[INVOCATION_STATE] = state;
}

/**
 * Returns the state of the invocation that owns the current async context, or
 * `undefined` outside any instrumented invocation (the default isolation scope is
 * shared, so state read from it could not be attributed to one invocation — and it
 * is never attached there in the first place).
 */
export function getInvocationState(): InvocationState | undefined {
  const isolationScope = getIsolationScope() as ScopeWithInvocationState;
  if (isolationScope === getDefaultIsolationScope()) {
    return undefined;
  }
  return isolationScope[INVOCATION_STATE];
}
