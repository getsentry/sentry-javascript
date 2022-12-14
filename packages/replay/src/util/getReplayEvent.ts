import { prepareEvent, Scope } from '@sentry/core';
import { Client, ReplayEvent } from '@sentry/types';

export async function getReplayEvent({
  client,
  scope,
  replayId: event_id,
  event,
}: {
  client: Client;
  scope: Scope;
  replayId: string;
  event: ReplayEvent;
}): Promise<ReplayEvent | null> {
  const preparedEvent = (await prepareEvent(client.getOptions(), event, { event_id }, scope)) as ReplayEvent | null;

  // If e.g. a global event processor returned null
  if (!preparedEvent) {
    return null;
  }

  // This normally happens in browser client "_prepareEvent"
  // but since we do not use this private method from the client, but rather the plain import
  // we need to do this manually.
  preparedEvent.platform = preparedEvent.platform || 'javascript';

  // extract the SDK name because `client._prepareEvent` doesn't add it to the event
  const metadata = client.getOptions() && client.getOptions()._metadata;
  const { name } = (metadata && metadata.sdk) || {};

  preparedEvent.sdk = {
    ...preparedEvent.sdk,
    version: __SENTRY_REPLAY_VERSION__,
    name,
  };

  return preparedEvent;
}
