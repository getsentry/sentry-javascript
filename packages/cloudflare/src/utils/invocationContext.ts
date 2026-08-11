import type { Scope } from '@sentry/core';
import { getDefaultIsolationScope, getIsolationScope } from '@sentry/core';
import type { ExecutionContextCompat } from '../executionContext';

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
   * the invocation that captured the data — even when a concurrent invocation has
   * since pointed the shared client at its own context.
   */
  readonly ctx: ExecutionContextCompat | undefined;
  /**
   * Set by `CloudflareClient.flush()` — the invocation's natural flush point.
   * Spans ending before it are drained by that flush; spans ending after it (in
   * `waitUntil` work or detached continuations) have no later flush to ride and
   * are delivered eagerly.
   */
  flushPointReached?: boolean;
  /**
   * Set while an eager span flush is scheduled for this invocation. Kept per
   * invocation (not on the shared client) so two concurrent invocations past
   * their flush point each schedule their own flush in their own async context —
   * the flush and its envelope send stay attributed to the owning invocation.
   */
  pendingSpanFlushTraceIds?: Set<string>;
  /** Eager transport drains owned by this invocation, serialized in capture order. */
  eagerFlushPromise?: PromiseLike<boolean>;
}

const INVOCATION_STATE: unique symbol = Symbol('sentryInvocationState');

type ScopeWithInvocationState = Scope & {
  [INVOCATION_STATE]?: InvocationState;
};

/**
 * Attaches invocation state to a forked isolation scope. Only meaningful on a scope
 * that outlives nothing but this invocation — never attach to the default isolation
 * scope, which is shared by every invocation in the isolate.
 */
export function setInvocationState(scope: Scope, state: InvocationState): void {
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
