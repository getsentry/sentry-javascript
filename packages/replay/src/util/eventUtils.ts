import type { ErrorEvent, Event, ReplayEvent, TransactionEvent } from '@sentry/types';

/** If the event is an error event */
export function isErrorEvent(event: Event): event is ErrorEvent {
  return !event.type;
}

/** If the event is a transaction event */
export function isTransactionEvent(event: Event): event is TransactionEvent {
  return event.type === 'transaction';
}

/** If the event is an replay event */
export function isReplayEvent(event: Event): event is ReplayEvent {
  return event.type === 'replay_event';
}
