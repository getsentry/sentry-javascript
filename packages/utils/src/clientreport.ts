import { ClientReport, ClientReportEnvelope } from '@sentry/types';

import { createEnvelope } from './envelope';
import { dateTimestampInSeconds } from './time';

/**
 * Creates client report envelope
 * @param discarded_events An array of discard events
 * @param dsn A DSN that can be set on the header. Optional.
 */
export function createClientReportEnvelope(
  discarded_events: Array<ClientReport['discarded_events']>,
  dsn?: string,
  timestamp?: number,
): ClientReportEnvelope {
  return createEnvelope<ClientReportEnvelope>(dsn ? { dsn } : {}, [
    [
      { type: 'client_report' },
      {
        timestamp: timestamp || dateTimestampInSeconds(),
        discarded_events,
      },
    ],
  ]);
}
