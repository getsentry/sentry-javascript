import type { EventProcessor, Hub, Integration } from '@sentry/types';
import { GLOBAL_OBJ, supportsReportingObserver } from '@sentry/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

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

/** Reporting API integration - https://w3c.github.io/reporting/ */
export class ReportingObserver implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReportingObserver';

  /**
   * @inheritDoc
   */
  public readonly name: string = ReportingObserver.id;

  /**
   * Returns current hub.
   */
  private _getCurrentHub?: () => Hub;

  /**
   * @inheritDoc
   */
  public constructor(
    private readonly _options: {
      types?: ReportTypes[];
    } = {
      types: ['crash', 'deprecation', 'intervention'],
    },
  ) {}

  /**
   * @inheritDoc
   */
  public setupOnce(_: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!supportsReportingObserver()) {
      return;
    }

    this._getCurrentHub = getCurrentHub;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const observer = new (WINDOW as any).ReportingObserver(this.handler.bind(this), {
      buffered: true,
      types: this._options.types,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    observer.observe();
  }

  /**
   * @inheritDoc
   */
  public handler(reports: Report[]): void {
    const hub = this._getCurrentHub && this._getCurrentHub();
    if (!hub || !hub.getIntegration(ReportingObserver)) {
      return;
    }
    for (const report of reports) {
      hub.withScope(scope => {
        scope.setExtra('url', report.url);

        const label = `ReportingObserver [${report.type}]`;
        let details = 'No details available';

        if (report.body) {
          // Object.keys doesn't work on ReportBody, as all properties are inheirted
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

        hub.captureMessage(`${label}: ${details}`);
      });
    }
  }
}
