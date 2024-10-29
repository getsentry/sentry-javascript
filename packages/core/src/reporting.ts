import type { Event, Report, StackParser } from '@sentry/types';
import { getClient } from './currentScopes';
import { createRawSecurityEnvelope } from './envelope';

/** Handles Reports from the Reporting API */
export async function handleReportingApi(
  reports: Report[],
  browserStackParser?: StackParser,
  client = getClient(),
): Promise<void> {
  if (!client) {
    // eslint-disable-next-line no-console
    console.warn('[Reporting API] No client available');
    return;
  }

  const dsn = client.getDsn();
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.warn('[Reporting API] No DSN set');
    return;
  }

  for (const report of reports) {
    if (report.type === 'crash') {
      const event: Event = {
        level: 'fatal',
        message: 'Crashed',
        request: {
          url: report.url,
          ...(report.user_agent && { headers: { 'User-Agent': report.user_agent } }),
        },
      };

      if (report.body.reason === 'oom') {
        event.message = 'Crashed: Out of memory';
      } else if (report.body.reason === 'unresponsive') {
        event.message = 'Crashed: Unresponsive';
      }

      if (report.body.stack && browserStackParser) {
        event.exception = {
          values: [
            {
              type: 'Crashed',
              value: event.message,
              stacktrace: { frames: browserStackParser(report.body.stack) },
            },
          ],
        };

        delete event.message;
      }

      client.captureEvent(event);
    } else if (report.type === 'csp-violation') {
      const options = client.getOptions();
      const envelope = createRawSecurityEnvelope(report, dsn, options.tunnel, options.release, options.environment);

      await client.sendEnvelope(envelope);
    }
  }
}
