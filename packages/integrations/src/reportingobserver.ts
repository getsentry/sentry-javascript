/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject, supportsReportingObserver } from '@sentry/utils';

/** JSDoc */
interface Report {
  [key: string]: any;
  type: ReportTypes;
  url: string;
  body?: ReportBody;
}

/** JSDoc */
const enum ReportTypes {
  /** JSDoc */
  Crash = 'crash',
  /** JSDoc */
  Deprecation = 'deprecation',
  /** JSDoc */
  Intervention = 'intervention',
}

/** JSDoc */
type ReportBody = CrashReportBody | DeprecationReportBody | InterventionReportBody;

/** JSDoc */
interface CrashReportBody {
  [key: string]: any;
  crashId: string;
  reason?: string;
}

/** JSDoc */
interface DeprecationReportBody {
  [key: string]: any;
  id: string;
  anticipatedRemoval?: Date;
  message: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
}

/** JSDoc */
interface InterventionReportBody {
  [key: string]: any;
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
      types: [ReportTypes.Crash, ReportTypes.Deprecation, ReportTypes.Intervention],
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const observer = new (getGlobalObject<any>().ReportingObserver)(this.handler.bind(this), {
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
            [key: string]: any;
          } = {};

          // eslint-disable-next-line guard-for-in
          for (const prop in report.body) {
            plainBody[prop] = report.body[prop];
          }

          scope.setExtra('body', plainBody);

          if (report.type === ReportTypes.Crash) {
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
