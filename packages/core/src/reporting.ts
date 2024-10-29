import type { Client, Event, Report } from '@sentry/types';
import { getClient } from './currentScopes';
import { createRawSecurityEnvelope } from './envelope';

/** Captures reports from the Reporting API */
export async function captureReportingApi(reports: Report[], options?: { client?: Client }): Promise<void> {
  const client = options?.client || getClient();

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

      client.captureEvent(event);
    } else if (report.type === 'csp-violation') {
      const options = client.getOptions();
      const envelope = createRawSecurityEnvelope(report, dsn, options.tunnel, options.release, options.environment);

      await client.sendEnvelope(envelope);
    }
  }
}
