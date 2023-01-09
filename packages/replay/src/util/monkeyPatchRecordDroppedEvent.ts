import { getCurrentHub } from '@sentry/core';
import { Client, DataCategory, Event, EventDropReason } from '@sentry/types';

let _originalRecordDroppedEvent: Client['recordDroppedEvent'] | undefined;

/**
 * Overwrite the `recordDroppedEvent` method on the client, so we can find out which events were dropped.
 * */
export function overwriteRecordDroppedEvent(errorIds: Set<string>): void {
  const client = getCurrentHub().getClient();

  if (!client) {
    return;
  }

  const _originalCallback = client.recordDroppedEvent.bind(client);

  const recordDroppedEvent: Client['recordDroppedEvent'] = (
    reason: EventDropReason,
    category: DataCategory,
    event?: Event,
  ): void => {
    if (event && !event.type && event.event_id) {
      errorIds.delete(event.event_id);
    }

    return _originalCallback(reason, category, event);
  };

  client.recordDroppedEvent = recordDroppedEvent;
  _originalRecordDroppedEvent = _originalCallback;
}

/**
 * Restore the original method.
 * */
export function restoreRecordDroppedEvent(): void {
  const client = getCurrentHub().getClient();

  if (!client || !_originalRecordDroppedEvent) {
    return;
  }

  client.recordDroppedEvent = _originalRecordDroppedEvent;
}
