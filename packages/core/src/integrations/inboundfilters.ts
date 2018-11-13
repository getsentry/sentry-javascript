import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Integration, SentryEvent } from '@sentry/types';
import { isRegExp } from '@sentry/utils/is';
import { logger } from '@sentry/utils/logger';
import { getEventDescription } from '@sentry/utils/misc';
import { includes } from '@sentry/utils/string';
import { Client } from '../interfaces';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

/** JSDoc */
interface InboundFiltersOptions {
  blacklistUrls?: Array<string | RegExp>;
  ignoreErrors?: Array<string | RegExp>;
  ignoreInternal?: boolean;
  whitelistUrls?: Array<string | RegExp>;
}

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = InboundFilters.id;
  /**
   * @inheritDoc
   */
  public static id: string = 'InboundFilters';

  public constructor(private readonly options: InboundFiltersOptions = {}) {}

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: SentryEvent) => {
      const hub = getCurrentHub();
      if (!hub) {
        return event;
      }
      const self = hub.getIntegration(InboundFilters);
      if (self) {
        const client = hub.getClient() as Client;
        const clientOptions = client ? client.getOptions() : {};
        const options = self.mergeOptions(clientOptions);
        if (self.shouldDropEvent(event, options)) {
          return null;
        }
      }
      return event;
    });
  }

  /** JSDoc */
  public shouldDropEvent(event: SentryEvent, options: InboundFiltersOptions): boolean {
    if (this.isSentryError(event, options)) {
      logger.warn(`Event dropped due to being internal Sentry Error.\nEvent: ${getEventDescription(event)}`);
      return true;
    }
    if (this.isIgnoredError(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
      return true;
    }
    if (this.isBlacklistedUrl(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`blacklistUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this.getEventFilterUrl(event)}`,
      );
      return true;
    }
    if (!this.isWhitelistedUrl(event, options)) {
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
  public isSentryError(event: SentryEvent, options: InboundFiltersOptions = {}): boolean {
    if (!options.ignoreInternal) {
      return false;
    }

    try {
      // tslint:disable-next-line:no-unsafe-any
      return (event as any).exception.values[0].type === 'SentryError';
    } catch (_oO) {
      return false;
    }
  }

  /** JSDoc */
  public isIgnoredError(event: SentryEvent, options: InboundFiltersOptions = {}): boolean {
    if (!options.ignoreErrors || !options.ignoreErrors.length) {
      return false;
    }

    return this.getPossibleEventMessages(event).some(message =>
      // Not sure why TypeScript complains here...
      (options.ignoreErrors as Array<RegExp | string>).some(pattern => this.isMatchingPattern(message, pattern)),
    );
  }

  /** JSDoc */
  public isBlacklistedUrl(event: SentryEvent, options: InboundFiltersOptions = {}): boolean {
    // TODO: Use Glob instead?
    if (!options.blacklistUrls || !options.blacklistUrls.length) {
      return false;
    }
    const url = this.getEventFilterUrl(event);
    return !url ? false : options.blacklistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  public isWhitelistedUrl(event: SentryEvent, options: InboundFiltersOptions = {}): boolean {
    // TODO: Use Glob instead?
    if (!options.whitelistUrls || !options.whitelistUrls.length) {
      return true;
    }
    const url = this.getEventFilterUrl(event);
    return !url ? true : options.whitelistUrls.some(pattern => this.isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  public mergeOptions(clientOptions: InboundFiltersOptions = {}): InboundFiltersOptions {
    return {
      blacklistUrls: [...(this.options.blacklistUrls || []), ...(clientOptions.blacklistUrls || [])],
      ignoreErrors: [
        ...(this.options.ignoreErrors || []),
        ...(clientOptions.ignoreErrors || []),
        ...DEFAULT_IGNORE_ERRORS,
      ],
      ignoreInternal: typeof this.options.ignoreInternal !== 'undefined' ? this.options.ignoreInternal : true,
      whitelistUrls: [...(this.options.whitelistUrls || []), ...(clientOptions.whitelistUrls || [])],
    };
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
