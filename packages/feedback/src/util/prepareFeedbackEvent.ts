import { getIsolationScope, prepareEvent } from '@sentry/core';
import type { Client, FeedbackEvent, Scope } from '@sentry/types';

interface PrepareFeedbackEventParams {
  client: Client;
  event: FeedbackEvent;
  scope: Scope;
}
/**
 * Prepare a feedback event & enrich it with the SDK metadata.
 */
export async function prepareFeedbackEvent({
  client,
  scope,
  event,
}: PrepareFeedbackEventParams): Promise<FeedbackEvent> {
  const eventHint = {};
  if (client.emit) {
    client.emit('preprocessEvent', event, eventHint);
  }

  const preparedEvent = (await prepareEvent(
    client.getOptions(),
    event,
    eventHint,
    scope,
    client,
    getIsolationScope(),
  )) as FeedbackEvent | null;

  if (preparedEvent === null) {
    // Taken from baseclient's `_processEvent` method, where this is handled for errors/transactions
    client.recordDroppedEvent('event_processor', 'feedback', event);
    throw new Error('Unable to prepare event');
  }

  // This normally happens in browser client "_prepareEvent"
  // but since we do not use this private method from the client, but rather the plain import
  // we need to do this manually.
  preparedEvent.platform = preparedEvent.platform || 'javascript';

  return preparedEvent;
}
