import type { Client, EventHint, ReplayEvent, Scope } from '@sentry/core';
import { getIsolationScope, prepareEvent } from '@sentry/core';

/**
 * Prepare a replay event & enrich it with the SDK metadata.
 */
export async function prepareReplayEvent({
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
  const integrations =
    typeof client['_integrations'] === 'object' &&
    client['_integrations'] !== null &&
    !Array.isArray(client['_integrations'])
      ? Object.keys(client['_integrations'])
      : undefined;

  const eventHint: EventHint = { event_id, integrations };

  client.emit('preprocessEvent', event, eventHint);

  const preparedEvent = (await prepareEvent(
    client.getOptions(),
    event,
    eventHint,
    scope,
    client,
    getIsolationScope(),
  )) as ReplayEvent | null;

  // If e.g. a global event processor returned null
  if (!preparedEvent) {
    return null;
  }

  client.emit('postprocessEvent', preparedEvent, eventHint);

  // This normally happens in browser client "_prepareEvent"
  // but since we do not use this private method from the client, but rather the plain import
  // we need to do this manually.
  preparedEvent.platform = preparedEvent.platform || 'javascript';

  // extract the SDK name because `client._prepareEvent` doesn't add it to the event
  const metadata = client.getSdkMetadata();
  const { name, version, settings } = metadata?.sdk || {};

  preparedEvent.sdk = {
    ...preparedEvent.sdk,
    name: name || 'sentry.javascript.unknown',
    version: version || '0.0.0',
    settings,
  };

  return preparedEvent;
}
