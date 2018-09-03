import { logger } from '@sentry/core';
import { getCurrentHub, Scope } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { isRegExp } from '@sentry/utils/is';
import { BrowserOptions } from '../backend';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /** JSDoc */
  private ignoreErrors?: Array<string | RegExp>;
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
  public install(options: BrowserOptions = {}): void {
    this.configureOptions(options);

    getCurrentHub().configureScope((scope: Scope) => {
      scope.addEventProcessor(async (event: SentryEvent) => {
        if (this.shouldDropEvent(event)) {
          return null;
        }
        return event;
      });
    });
  }

  /** JSDoc */
  public shouldDropEvent(event: SentryEvent): boolean {
    if (this.isIgnoredError(event)) {
      logger.warn(`Event dropped due to being matched by \`ignoreErrors\` option.\n  Event: ${event.event_id}`);
      return true;
    }
    if (this.isBlacklistedUrl(event)) {
      logger.warn(`Event dropped due to being matched by \`blacklistUrls\` option.\n  Event: ${event.event_id}`);
      return true;
    }
    if (!this.isWhitelistedUrl(event)) {
      logger.warn(`Event dropped due to not being matched by \`whitelistUrls\` option.\n  Event: ${event.event_id}`);
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
    return this.blacklistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  public isWhitelistedUrl(event: SentryEvent): boolean {
    // TODO: Use Glob instead?
    if (!this.whitelistUrls) {
      return true;
    }
    const url = this.getEventFilterUrl(event);
    return this.whitelistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private isMatchingPattern(value: string, pattern: RegExp | string): boolean {
    if (isRegExp(pattern)) {
      return (pattern as RegExp).test(value);
    } else if (typeof pattern === 'string') {
      return value.includes(pattern);
    } else {
      return false;
    }
  }

  /** JSDoc */
  private configureOptions(options: BrowserOptions): void {
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
    const evt = event as any;

    if (evt.message) {
      return [evt.message];
    } else if (evt.exception) {
      try {
        const { type, value } = evt.exception.values[0];
        return [`${value}`, `${type}: ${value}`];
      } catch (oO) {
        logger.error(`Cannot extract message for event ${event.event_id}`);
        return [];
      }
    } else {
      return [];
    }
  }

  /** JSDoc */
  private getEventFilterUrl(event: SentryEvent): string {
    const evt = event as any;

    try {
      if (evt.stacktrace) {
        return evt.stacktrace.frames[0].filename;
      } else if (evt.exception) {
        return evt.exception.values[0].stacktrace.frames[0].filename;
      } else {
        return '';
      }
    } catch (oO) {
      logger.error(`Cannot extract url for event ${event.event_id}`);
      return '';
    }
  }
}
