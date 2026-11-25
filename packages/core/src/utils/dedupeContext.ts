import type { Scope } from '../scope';
import type { EventHint } from '../types/event';

/**
 * How the Dedupe integration treats an error event. The client sets it before event processors run.
 *
 * - `drop`: Dedupe drops a duplicate, like any other event processor.
 * - `mark`: The duplicate can still change a session. If it is the first copy in its isolation scope (e.g. request), or
 *   if it is unhandled, Dedupe marks it and keeps it, so that it runs through all event processors and `beforeSend`.
 *   The client drops it after the session update, like a sampled-out error.
 * - `ignore`: The error is never sent. Dedupe does not compare it and does not remember it.
 */
export type DedupeContext =
  | { mode: 'ignore' }
  | { mode: 'drop'; isolationScope: Scope }
  | { mode: 'mark'; isolationScope: Scope; isDuplicate: boolean };

const dedupeContexts = new WeakMap<EventHint, DedupeContext>();

/** Sets how the Dedupe integration treats the error event of this hint. */
export function setDedupeContext(hint: EventHint, context: DedupeContext): void {
  dedupeContexts.set(hint, context);
}

/** Gets how the Dedupe integration treats the error event of this hint. */
export function getDedupeContext(hint: EventHint): DedupeContext | undefined {
  return dedupeContexts.get(hint);
}

/** Whether the Dedupe integration marked the error event of this hint as a duplicate. */
export function isMarkedDuplicate(hint: EventHint): boolean {
  const context = dedupeContexts.get(hint);
  return context?.mode === 'mark' && context.isDuplicate;
}
