import type { Client, IntegrationFn } from '@sentry/core';
import {
  captureMessage,
  defineIntegration,
  getClient,
  GLOBAL_OBJ,
  supportsReportingObserver,
  withScope,
} from '@sentry/core';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

const INTEGRATION_NAME = 'ReportingObserver';

interface Report {
  [key: string]: unknown;
  type: ReportTypes;
  url: string;
  body?: ReportBody;
}

type ReportTypes = 'crash' | 'deprecation' | 'intervention';

type ReportBody = CrashReportBody | DeprecationReportBody | InterventionReportBody;

interface CrashReportBody {
  [key: string]: unknown;
  crashId: string;
  reason?: string;
}

interface DeprecationReportBody {
  [key: string]: unknown;
  id: string;
  anticipatedRemoval?: Date;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface InterventionReportBody {
  [key: string]: unknown;
  id: string;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface ReportingObserverOptions {
  types?: ReportTypes[];
}

/** This is experimental and the types are not included with TypeScript, sadly. */
interface ReportingObserverClass {
  new (
    handler: (reports: Report[]) => void,
    options: { buffered?: boolean; types?: ReportTypes[] },
  ): {
    observe: () => void;
  };
}

const SETUP_CLIENTS = new WeakMap<Client, boolean>();

const _reportingObserverIntegration = ((options: ReportingObserverOptions = {}) => {
  const types = options.types || ['crash', 'deprecation', 'intervention'];

  /** Handler for the reporting observer. */
  function handler(reports: Report[]): void {
    if (!SETUP_CLIENTS.has(getClient() as Client)) {
      return;
    }

    for (const report of reports) {
      withScope(scope => {
        scope.setExtra('url', report.url);

        const label = `ReportingObserver [${report.type}]`;
        let details = 'No details available';

        if (report.body) {
          // Object.keys doesn't work on ReportBody, as all properties are inherited
          const plainBody: {
            [key: string]: unknown;
          } = {};

          // eslint-disable-next-line guard-for-in
          for (const prop in report.body) {
            plainBody[prop] = report.body[prop];
          }

          scope.setExtra('body', plainBody);

          if (report.type === 'crash') {
            const body = report.body as CrashReportBody;
            // A fancy way to create a message out of crashId OR reason OR both OR fallback
            details = [body.crashId || '', body.reason || ''].join(' ').trim() || details;
          } else {
            const body = report.body as DeprecationReportBody | InterventionReportBody;
            details = body.message || details;
          }
        }

        captureMessage(`${label}: ${details}`);
      });
    }
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      if (!supportsReportingObserver()) {
        return;
      }

      const observer = new (WINDOW as typeof WINDOW & { ReportingObserver: ReportingObserverClass }).ReportingObserver(
        handler,
        {
          buffered: true,
          types,
        },
      );

      observer.observe();
    },

    setup(client): void {
      SETUP_CLIENTS.set(client, true);
    },
  };
}) satisfies IntegrationFn;

/**
 * Reporting API integration - https://w3c.github.io/reporting/
 */
export const reportingObserverIntegration = defineIntegration(_reportingObserverIntegration);
