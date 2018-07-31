import { logger } from '@sentry/core';
import { getDefaultHub } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { joinRegExp } from '@sentry/utils/string';
import { BrowserOptions } from '../backend';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];
const MATCH_NOTHING = new RegExp(/.^/);
const MATCH_EVERYTHING = new RegExp('');

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /** JSDoc */
  private ignoreErrors: RegExp = joinRegExp(DEFAULT_IGNORE_ERRORS);
  /** JSDoc */
  private blacklistUrls: RegExp = MATCH_NOTHING;
  /** JSDoc */
  private whitelistUrls: RegExp = MATCH_EVERYTHING;

  /**
   * @inheritDoc
   */
  public name: string = 'InboundFilters';
  /**
   * @inheritDoc
   */
  public install(options: BrowserOptions = {}): void {
    this.configureOptions(options);

    getDefaultHub().addEventProcessor(async (event: SentryEvent) => {
      if (this.shouldDropEvent(event)) {
        return null;
      }
      return event;
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
    return this.getPossibleEventMessages(event).some(message => this.ignoreErrors.test(message));
  }

  /** JSDoc */
  public isWhitelistedUrl(event: SentryEvent): boolean {
    return this.whitelistUrls.test(this.getEventFilterUrl(event));
  }

  /** JSDoc */
  public isBlacklistedUrl(event: SentryEvent): boolean {
    return this.blacklistUrls.test(this.getEventFilterUrl(event));
  }

  /** JSDoc */
  private configureOptions(options: BrowserOptions): void {
    if (options.ignoreErrors && options.ignoreErrors.length) {
      this.ignoreErrors = joinRegExp([...DEFAULT_IGNORE_ERRORS, ...options.ignoreErrors]);
    }
    if (options.blacklistUrls && options.blacklistUrls.length) {
      this.blacklistUrls = joinRegExp([...options.blacklistUrls]);
    }
    if (options.whitelistUrls && options.whitelistUrls.length) {
      this.whitelistUrls = joinRegExp([...options.whitelistUrls]);
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

    if (evt.stacktrace) {
      return evt.stacktrace.frames[0].filename;
    } else if (evt.exception) {
      try {
        return evt.exception.values[0].stacktrace.frames[0].filename;
      } catch (oO) {
        logger.error(`Cannot extract url for event ${event.event_id}`);
        return '';
      }
    } else {
      return '';
    }
  }
}
