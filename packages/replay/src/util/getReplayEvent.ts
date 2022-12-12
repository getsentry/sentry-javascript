import { Scope } from '@sentry/core';
import { Client, Event } from '@sentry/types';

import { REPLAY_SDK_INFO } from '../constants';

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
}): Promise<Event> {
  // XXX: This event does not trigger `beforeSend` in SDK
  // @ts-ignore private api
  const preparedEvent: Event = await client._prepareEvent(event, { event_id }, scope);

  const session = scope && scope.getSession();
  if (session) {
    // @ts-ignore private api
    client._updateSessionFromEvent(session, preparedEvent);
  }

  preparedEvent.sdk = {
    ...preparedEvent.sdk,
    ...REPLAY_SDK_INFO,
  };

  return preparedEvent;
}
