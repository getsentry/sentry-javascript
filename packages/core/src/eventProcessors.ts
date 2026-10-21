import { DEBUG_BUILD } from './debug-build';
import type { Event, EventHint } from './types/event';
import type { EventProcessor } from './types/eventprocessor';
import { debug } from './utils/debug-logger';
import { isThenable } from './utils/is';
import { safeCallback } from './utils/safeCallback';
import { rejectedSyncPromise, resolvedSyncPromise } from './utils/syncpromise';

type EventProcessorDropReason = 'event_processor' | 'callback_error';

/**
 * Process an array of event processors, returning the processed event (or `null` if the event was dropped).
 */
export function notifyEventProcessors(
  processors: EventProcessor[],
  event: Event | null,
  hint: EventHint,
  index: number = 0,
  onDrop?: (reason: EventProcessorDropReason) => void,
): PromiseLike<Event | null> {
  try {
    const result = _notifyEventProcessors(event, hint, processors, index, onDrop);
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
  onDrop?: (reason: EventProcessorDropReason) => void,
): Event | null | PromiseLike<Event | null> {
  const processor = processors[index];

  if (!event || !processor) {
    return event;
  }

  const processorName = `Event processor "${processor.id || '?'}"`;
  let callbackError = false;

  const result = safeCallback(
    DEBUG_BUILD ? `${processorName} threw an error, dropping event:` : '',
    () => processor({ ...event }, hint),
    () => {
      callbackError = true;
      return null;
    },
  );

  DEBUG_BUILD && result === null && debug.log(`${processorName} dropped event`);

  if (isThenable(result)) {
    return result.then(final => {
      if (!final) {
        onDrop?.(callbackError ? 'callback_error' : 'event_processor');
        return null;
      }
      return _notifyEventProcessors(final, hint, processors, index + 1, onDrop);
    });
  }

  if (!result) {
    onDrop?.(callbackError ? 'callback_error' : 'event_processor');
    return null;
  }
  return _notifyEventProcessors(result, hint, processors, index + 1, onDrop);
}
