import { ClientReport, ClientReportEnvelope } from '@sentry/types';

import { createEnvelope } from './envelope';
import { dateTimestampInSeconds } from './time';

/**
 * Creates client report envelope
 * @param discarded_events An array of discard events
 * @param dsn A DSN that can be set on the header. Optional.
 */
export function createClientReportEnvelope(
  discarded_events: ClientReport['discarded_events'],
  dsn?: string,
  timestamp?: number,
): ClientReportEnvelope {
  const header = dsn ? { dsn } : {};

  const itemHeader = { type: 'client_report' };
  const itemPayload = {
    timestamp: timestamp || dateTimestampInSeconds(),
    discarded_events,
  };

  return createEnvelope<ClientReportEnvelope>(header, [[itemHeader, itemPayload]]);
}
