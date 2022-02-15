import { ClientReportEnvelope, ClientReportEnvelopeItemHeader, ClientReportEnvelopeItemPayload } from '@sentry/types';

import { createEnvelope } from './envelope';
import { dateTimestampInSeconds } from './time';

/**
 * Creates client report envelope
 * @param discarded_events An array of discard events
 * @param dsn A DSN that can be set on the header. Optional.
 */
export function createClientReportEnvelope(
  discarded_events: ClientReportEnvelopeItemPayload['discarded_events'],
  dsn?: string,
  timestamp?: number,
): ClientReportEnvelope {
  const header = dsn ? { dsn } : {};

  const itemHeader: ClientReportEnvelopeItemHeader = { type: 'client_report' };
  const itemPayload: ClientReportEnvelopeItemPayload = {
    timestamp: timestamp || dateTimestampInSeconds(),
    discarded_events,
  };

  return createEnvelope<ClientReportEnvelope>(header, [[itemHeader, itemPayload]]);
}
