import { DEBUG_BUILD } from './debug-build';
import type { Event, EventHint } from './types-hoist/event';
import type { EventProcessor } from './types-hoist/eventprocessor';
import { debug } from './utils/debug-logger';
import { isThenable } from './utils/is';
import { rejectedSyncPromise, resolvedSyncPromise } from './utils/syncpromise';

/**
 * Process an array of event processors, returning the processed event (or `null` if the event was dropped).
 */
export function notifyEventProcessors(
  processors: EventProcessor[],
  event: Event | null,
  hint: EventHint,
  index: number = 0,
): PromiseLike<Event | null> {
  try {
    const result = _notifyEventProcessors(event, hint, processors, index);
    return isThenable(result) ? result : resolvedSyncPromise(result);
  } catch (error) {
    return rejectedSyncPromise(error);
  }
}

function _notifyEventProcessors(
  event: Event | null,
  hint: EventHint,
  processors: EventProcessor[],
  index: number,
): Event | null | PromiseLike<Event | null> {
  const processor = processors[index];

  if (!event || !processor) {
    return event;
  }

  const result = processor({ ...event }, hint);

  DEBUG_BUILD && result === null && debug.log(`Event processor "${processor.id || '?'}" dropped event`);

  if (isThenable(result)) {
    return result.then(final => _notifyEventProcessors(final, hint, processors, index + 1));
  }

  return _notifyEventProcessors(result, hint, processors, index + 1);
}
