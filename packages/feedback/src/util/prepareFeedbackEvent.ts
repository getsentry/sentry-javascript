import type { Scope } from '@sentry/core';
import { prepareEvent } from '@sentry/core';
import type { Client, FeedbackEvent } from '@sentry/types';

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
}: PrepareFeedbackEventParams): Promise<FeedbackEvent | null> {
  const eventHint = {};
  if (client.emit) {
    client.emit('preprocessEvent', event, eventHint);
  }

  const preparedEvent = (await prepareEvent(
    client.getOptions(),
    event,
    { integrations: undefined },
    scope,
    client,
  )) as FeedbackEvent | null;

  if (preparedEvent === null) {
    // Taken from baseclient's `_processEvent` method, where this is handled for errors/transactions
    client.recordDroppedEvent('event_processor', 'feedback', event);
    return null;
  }

  // This normally happens in browser client "_prepareEvent"
  // but since we do not use this private method from the client, but rather the plain import
  // we need to do this manually.
  preparedEvent.platform = preparedEvent.platform || 'javascript';

  return preparedEvent;
}
