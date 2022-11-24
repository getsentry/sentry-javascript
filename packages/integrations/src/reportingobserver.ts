import { Event, EventProcessor, Hub, InboundFiltersOptions, Integration, StackFrame } from '@sentry/types';
import { getEventDescription, GLOBAL_OBJ, isMatchingPattern, logger, supportsReportingObserver } from '@sentry/utils';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

/** Options for the ReportingObserver integration */
export interface ReportingObserverOptions {
  types?: ReportTypes[];
  applyAllowUrls?: boolean;
  applyDenyUrls?: boolean;
  applyIgnoreErrors?: boolean;
}

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

  private readonly _options: ReportingObserverOptions;

  public constructor(options?: ReportingObserverOptions) {
    this._options = {
      types: ['crash', 'deprecation', 'intervention'],
      applyAllowUrls: true,
      applyDenyUrls: true,
      applyIgnoreErrors: true,
      ...options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    if (!supportsReportingObserver()) {
      return;
    }

    this._getCurrentHub = getCurrentHub;

    const eventProcessor: EventProcessor = (event: Event) => {
      const hub = getCurrentHub();
      if (hub) {
        const self = hub.getIntegration(ReportingObserver);
        if (self) {
          const client = hub.getClient();
          const clientOptions = client ? client.getOptions() : {};
          return shouldDropEvent(event, self._options, clientOptions) ? null : event;
        }
      }
      return event;
    };

    eventProcessor.id = this.name;
    addGlobalEventProcessor(eventProcessor);

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

/** JSDoc */
export function shouldDropEvent(
  event: Event,
  internalOptions: Partial<ReportingObserverOptions>,
  filtersOptions: Partial<InboundFiltersOptions>,
): boolean {
  if (internalOptions.applyIgnoreErrors && isIgnoredError(event, filtersOptions.ignoreErrors)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
    return true;
  }
  if (internalOptions.applyDenyUrls && isDeniedUrl(event, filtersOptions.denyUrls)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${getEventFilterUrl(event)}`,
      );
    return true;
  }
  if (internalOptions.applyAllowUrls && !isAllowedUrl(event, filtersOptions.allowUrls)) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${getEventFilterUrl(event)}`,
      );
    return true;
  }
  return false;
}

function isIgnoredError(event: Event, ignoreErrors?: Array<string | RegExp>): boolean {
  if (!ignoreErrors || !ignoreErrors.length) {
    return false;
  }

  return getPossibleEventMessages(event).some(message =>
    ignoreErrors.some(pattern => isMatchingPattern(message, pattern)),
  );
}

function isDeniedUrl(event: Event, denyUrls?: Array<string | RegExp>): boolean {
  // TODO: Use Glob instead?
  if (!denyUrls || !denyUrls.length) {
    return false;
  }
  const url = getEventFilterUrl(event);
  return !url ? false : denyUrls.some(pattern => isMatchingPattern(url, pattern));
}

function isAllowedUrl(event: Event, allowUrls?: Array<string | RegExp>): boolean {
  // TODO: Use Glob instead?
  if (!allowUrls || !allowUrls.length) {
    return true;
  }
  const url = getEventFilterUrl(event);
  return !url ? true : allowUrls.some(pattern => isMatchingPattern(url, pattern));
}

function getPossibleEventMessages(event: Event): string[] {
  if (event.message) {
    return [event.message];
  }
  if (event.exception) {
    try {
      const { type = '', value = '' } = (event.exception.values && event.exception.values[0]) || {};
      return [`${value}`, `${type}: ${value}`];
    } catch (oO) {
      __DEBUG_BUILD__ && logger.error(`Cannot extract message for event ${getEventDescription(event)}`);
      return [];
    }
  }
  return [];
}

function getLastValidUrl(frames: StackFrame[] = []): string | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];

    if (frame && frame.filename !== '<anonymous>' && frame.filename !== '[native code]') {
      return frame.filename || null;
    }
  }

  return null;
}

function getEventFilterUrl(event: Event): string | null {
  try {
    let frames;
    try {
      // @ts-ignore we only care about frames if the whole thing here is defined
      frames = event.exception.values[0].stacktrace.frames;
    } catch (e) {
      // ignore
    }
    return frames ? getLastValidUrl(frames) : null;
  } catch (oO) {
    __DEBUG_BUILD__ && logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
    return null;
  }
}
