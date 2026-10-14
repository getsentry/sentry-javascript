import type { Scope } from '../scope';
import { derefWeakRef, makeWeakRef, type MaybeWeakRef } from './weakRef';

const SCOPE_INCOMING_REQUEST_FIELD = 'incomingRequest';

/**
 * Set the incoming request (e.g. Node's `IncomingMessage`) that a request's isolation scope belongs to.
 * NOTE: This should NOT be used directly, but is only used internally by the server instrumentation.
 */
export function _setIncomingRequestForScope(scope: Scope, request: object): void {
  // Use WeakRef so a scope that outlives the request (e.g. captured on a span) does not keep it alive
  scope.refs[SCOPE_INCOMING_REQUEST_FIELD] = makeWeakRef(request);
}

/**
 * Get the incoming request that a request's isolation scope belongs to.
 * NOTE: This should NOT be used directly, but is only used internally by framework SDKs.
 */
export function _getIncomingRequestForScope(scope: Scope): object | undefined {
  return derefWeakRef(scope.refs[SCOPE_INCOMING_REQUEST_FIELD] as MaybeWeakRef<object> | undefined);
}
