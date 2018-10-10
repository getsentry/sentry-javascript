import { getCurrentHub } from '@sentry/hub';
import { configureScope } from '@sentry/minimal';
import { Integration, SentryEvent } from '@sentry/types';
import { isRegExp } from '@sentry/utils/is';
import { getEventDescription } from '@sentry/utils/misc';
import { includes } from '@sentry/utils/string';
import { logger } from '../logger';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

/** JSDoc */
interface InboundFiltersOptions {
  ignoreErrors?: Array<string | RegExp>;
  blacklistUrls?: Array<string | RegExp>;
  whitelistUrls?: Array<string | RegExp>;
}

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /** JSDoc */
  private ignoreErrors?: Array<string | RegExp> = DEFAULT_IGNORE_ERRORS;
  /** JSDoc */
  private blacklistUrls?: Array<string | RegExp>;
  /** JSDoc */
  private whitelistUrls?: Array<string | RegExp>;

  /**
   * @inheritDoc
   */
  public name: string = 'InboundFilters';
  /**
   * @inheritDoc
   */
  public setupOnce(options: InboundFiltersOptions = {}): void {
    if (getCurrentHub().getIntegration(this.name)) {
      this.configureOptions(options);

      configureScope(scope => {
        scope.addEventProcessor(async (event: SentryEvent) => {
          if (this.shouldDropEvent(event)) {
            return null;
          }
          return event;
        });
      });
    }
  }

  /** JSDoc */
  public shouldDropEvent(event: SentryEvent): boolean {
    if (this.isIgnoredError(event)) {
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
      return true;
    }
    if (this.isBlacklistedUrl(event)) {
      logger.warn(
        `Event dropped due to being matched by \`blacklistUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this.getEventFilterUrl(event)}`,
      );
      return true;
    }
    if (!this.isWhitelistedUrl(event)) {
      logger.warn(
        `Event dropped due to not being matched by \`whitelistUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this.getEventFilterUrl(event)}`,
      );
      return true;
    }
    return false;
  }

  /** JSDoc */
  public isIgnoredError(event: SentryEvent): boolean {
    if (!this.ignoreErrors) {
      return false;
    }

    return this.getPossibleEventMessages(event).some(message =>
      // Not sure why TypeScript complains here...
      (this.ignoreErrors as Array<RegExp | string>).some(pattern => this.isMatchingPattern(message, pattern)),
    );
  }

  /** JSDoc */
  public isBlacklistedUrl(event: SentryEvent): boolean {
    // TODO: Use Glob instead?
    if (!this.blacklistUrls) {
      return false;
    }
    const url = this.getEventFilterUrl(event);
    return !url ? false : this.blacklistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  public isWhitelistedUrl(event: SentryEvent): boolean {
    // TODO: Use Glob instead?
    if (!this.whitelistUrls) {
      return true;
    }
    const url = this.getEventFilterUrl(event);
    return !url ? true : this.whitelistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private isMatchingPattern(value: string, pattern: RegExp | string): boolean {
    if (isRegExp(pattern)) {
      return (pattern as RegExp).test(value);
    } else if (typeof pattern === 'string') {
      return includes(value, pattern);
    } else {
      return false;
    }
  }

  /** JSDoc */
  private configureOptions(options: InboundFiltersOptions): void {
    if (options.ignoreErrors) {
      this.ignoreErrors = [...DEFAULT_IGNORE_ERRORS, ...options.ignoreErrors];
    }
    if (options.blacklistUrls) {
      this.blacklistUrls = [...options.blacklistUrls];
    }
    if (options.whitelistUrls) {
      this.whitelistUrls = [...options.whitelistUrls];
    }
  }

  /** JSDoc */
  private getPossibleEventMessages(event: SentryEvent): string[] {
    if (event.message) {
      return [event.message];
    } else if (event.exception) {
      try {
        // tslint:disable-next-line:no-unsafe-any
        const { type, value } = (event as any).exception.values[0];
        return [`${value}`, `${type}: ${value}`];
      } catch (oO) {
        logger.error(`Cannot extract message for event ${getEventDescription(event)}`);
        return [];
      }
    } else {
      return [];
    }
  }

  /** JSDoc */
  private getEventFilterUrl(event: SentryEvent): string | null {
    try {
      if (event.stacktrace) {
        // tslint:disable-next-line:no-unsafe-any
        return (event as any).stacktrace.frames[0].filename;
      } else if (event.exception) {
        // tslint:disable-next-line:no-unsafe-any
        return (event as any).exception.values[0].stacktrace.frames[0].filename;
      } else {
        return null;
      }
    } catch (oO) {
      logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
      return null;
    }
  }
}
