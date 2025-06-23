import type { ClientReport } from '../types-hoist/clientreport';
import type { ClientReportEnvelope, ClientReportItem } from '../types-hoist/envelope';
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
  const clientReportItem: ClientReportItem = [
    { type: 'client_report' },
    {
      timestamp: timestamp || dateTimestampInSeconds(),
      discarded_events,
    },
  ];
  return createEnvelope<ClientReportEnvelope>(dsn ? { dsn } : {}, [clientReportItem]);
}
