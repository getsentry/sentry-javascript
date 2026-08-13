import type { EventHint } from '../types/event';

export type EventCaptureDecision = 'accepted' | 'rejected';

interface EventCaptureDecisionState {
  callback?: (decision: EventCaptureDecision) => void;
  resolved: boolean;
}

const EVENT_CAPTURE_DECISIONS = new WeakMap<EventHint, EventCaptureDecisionState>();

/** Attach an internal callback which resolves when the event pipeline makes its terminal capture decision. */
export function setEventCaptureDecisionCallback(
  hint: EventHint,
  callback: (decision: EventCaptureDecision) => void,
): void {
  EVENT_CAPTURE_DECISIONS.set(hint, { callback, resolved: false });
}

/** Preserve internal capture-decision state when the client adds an event ID to a hint. */
export function copyEventCaptureDecision(source: EventHint | undefined, target: EventHint): void {
  if (!source) {
    return;
  }

  const state = EVENT_CAPTURE_DECISIONS.get(source);
  if (state) {
    EVENT_CAPTURE_DECISIONS.set(target, state);
  }
}

/** Resolve an internal capture decision once without allowing telemetry bookkeeping to affect event processing. */
export function notifyEventCaptureDecision(hint: EventHint, decision: EventCaptureDecision): void {
  const state = EVENT_CAPTURE_DECISIONS.get(hint);
  EVENT_CAPTURE_DECISIONS.delete(hint);
  if (!state || state.resolved || !state.callback) {
    return;
  }

  state.resolved = true;
  const callback = state.callback;
  state.callback = undefined;
  try {
    callback(decision);
  } catch {
    // Capture-decision observers only coordinate internal telemetry and must never alter application behavior.
  }
}
