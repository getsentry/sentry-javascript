import { Scope } from '@sentry/core';
import { Client, Event } from '@sentry/types';

export async function getReplayEvent({
  client,
  scope,
  replayId: event_id,
  event,
}: {
  client: Client;
  scope: Scope;
  replayId: string;
  event: Event;
}): Promise<Event | null> {
  // XXX: This event does not trigger `beforeSend` in SDK
  // @ts-ignore private api
  const preparedEvent: Event | null = await client._prepareEvent(event, { event_id }, scope);

  if (preparedEvent) {
    // extract the SDK name because `client._prepareEvent` doesn't add it to the event
    const metadata = client.getOptions() && client.getOptions()._metadata;
    const { name } = (metadata && metadata.sdk) || {};

    preparedEvent.sdk = {
      ...preparedEvent.sdk,
      version: __SENTRY_REPLAY_VERSION__,
      name,
    };
  }

  return preparedEvent;
}
