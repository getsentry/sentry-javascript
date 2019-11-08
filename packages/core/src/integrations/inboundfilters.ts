import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Event, Integration } from '@sentry/types';
import { getEventDescription, isMatchingPattern, logger } from '@sentry/utils';

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

  public constructor(private readonly _options: InboundFiltersOptions = {}) {}

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor((event: Event) => {
      const hub = getCurrentHub();
      if (!hub) {
        return event;
      }
      const self = hub.getIntegration(InboundFilters);
      if (self) {
        const client = hub.getClient();
        const clientOptions = client ? client.getOptions() : {};
        const options = self._mergeOptions(clientOptions);
        if (self._shouldDropEvent(event, options)) {
          return null;
        }
      }
      return event;
    });
  }

  /** JSDoc */
  private _shouldDropEvent(event: Event, options: InboundFiltersOptions): boolean {
    if (this._isSentryError(event, options)) {
      logger.warn(`Event dropped due to being internal Sentry Error.\nEvent: ${getEventDescription(event)}`);
      return true;
    }
    if (this._isIgnoredError(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
      );
      return true;
    }
    if (this._isBlacklistedUrl(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`blacklistUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }
    if (!this._isWhitelistedUrl(event, options)) {
      logger.warn(
        `Event dropped due to not being matched by \`whitelistUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }
    return false;
  }

  /** JSDoc */
  private _isSentryError(event: Event, options: InboundFiltersOptions = {}): boolean {
    if (!options.ignoreInternal) {
      return false;
    }

    try {
      return (
        (event &&
          event.exception &&
          event.exception.values &&
          event.exception.values[0] &&
          event.exception.values[0].type === 'SentryError') ||
        false
      );
    } catch (_oO) {
      return false;
    }
  }

  /** JSDoc */
  private _isIgnoredError(event: Event, options: InboundFiltersOptions = {}): boolean {
    if (!options.ignoreErrors || !options.ignoreErrors.length) {
      return false;
    }

    return this._getPossibleEventMessages(event).some(message =>
      // Not sure why TypeScript complains here...
      (options.ignoreErrors as Array<RegExp | string>).some(pattern => isMatchingPattern(message, pattern)),
    );
  }

  /** JSDoc */
  private _isBlacklistedUrl(event: Event, options: InboundFiltersOptions = {}): boolean {
    // TODO: Use Glob instead?
    if (!options.blacklistUrls || !options.blacklistUrls.length) {
      return false;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? false : options.blacklistUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private _isWhitelistedUrl(event: Event, options: InboundFiltersOptions = {}): boolean {
    // TODO: Use Glob instead?
    if (!options.whitelistUrls || !options.whitelistUrls.length) {
      return true;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? true : options.whitelistUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private _mergeOptions(clientOptions: InboundFiltersOptions = {}): InboundFiltersOptions {
    return {
      blacklistUrls: [...(this._options.blacklistUrls || []), ...(clientOptions.blacklistUrls || [])],
      ignoreErrors: [
        ...(this._options.ignoreErrors || []),
        ...(clientOptions.ignoreErrors || []),
        ...DEFAULT_IGNORE_ERRORS,
      ],
      ignoreInternal: typeof this._options.ignoreInternal !== 'undefined' ? this._options.ignoreInternal : true,
      whitelistUrls: [...(this._options.whitelistUrls || []), ...(clientOptions.whitelistUrls || [])],
    };
  }

  /** JSDoc */
  private _getPossibleEventMessages(event: Event): string[] {
    if (event.message) {
      return [event.message];
    }
    if (event.exception) {
      try {
        const { type = '', value = '' } = (event.exception.values && event.exception.values[0]) || {};
        return [`${value}`, `${type}: ${value}`];
      } catch (oO) {
        logger.error(`Cannot extract message for event ${getEventDescription(event)}`);
        return [];
      }
    }
    return [];
  }

  /** JSDoc */
  private _getEventFilterUrl(event: Event): string | null {
    try {
      if (event.stacktrace) {
        const frames = event.stacktrace.frames;
        return (frames && frames[frames.length - 1].filename) || null;
      }
      if (event.exception) {
        const frames =
          event.exception.values && event.exception.values[0].stacktrace && event.exception.values[0].stacktrace.frames;
        return (frames && frames[frames.length - 1].filename) || null;
      }
      return null;
    } catch (oO) {
      logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
      return null;
    }
  }
}
