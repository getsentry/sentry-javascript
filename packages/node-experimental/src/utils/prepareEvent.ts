import { Scope } from '@sentry/core';
import type { CaptureContext, EventHint, Scope as ScopeInterface, ScopeContext } from '@sentry/types';

/**
 * This type makes sure that we get either a CaptureContext, OR an EventHint.
 * It does not allow mixing them, which could lead to unexpected outcomes, e.g. this is disallowed:
 * { user: { id: '123' }, mechanism: { handled: false } }
 */
export type ExclusiveEventHintOrCaptureContext =
  | (CaptureContext & Partial<{ [key in keyof EventHint]: never }>)
  | (EventHint & Partial<{ [key in keyof ScopeContext]: never }>);

/**
 * Parse either an `EventHint` directly, or convert a `CaptureContext` to an `EventHint`.
 * This is used to allow to update method signatures that used to accept a `CaptureContext` but should now accept an `EventHint`.
 */
export function parseEventHintOrCaptureContext(
  hint: ExclusiveEventHintOrCaptureContext | undefined,
): EventHint | undefined {
  if (!hint) {
    return undefined;
  }

  // If you pass a Scope or `() => Scope` as CaptureContext, we just return this as captureContext
  if (hintIsScopeOrFunction(hint)) {
    return { captureContext: hint };
  }

  if (hintIsScopeContext(hint)) {
    return {
      captureContext: hint,
    };
  }

  return hint;
}

function hintIsScopeOrFunction(
  hint: CaptureContext | EventHint,
): hint is ScopeInterface | ((scope: ScopeInterface) => ScopeInterface) {
  return hint instanceof Scope || typeof hint === 'function';
}

type ScopeContextProperty = keyof ScopeContext;
const captureContextKeys: readonly ScopeContextProperty[] = [
  'user',
  'level',
  'extra',
  'contexts',
  'tags',
  'fingerprint',
  'requestSession',
  'propagationContext',
] as const;

function hintIsScopeContext(hint: Partial<ScopeContext> | EventHint): hint is Partial<ScopeContext> {
  return Object.keys(hint).some(key => captureContextKeys.includes(key as ScopeContextProperty));
}
