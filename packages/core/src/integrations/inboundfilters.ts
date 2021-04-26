import { addGlobalEventProcessor, getCurrentHub } from '@sentry/hub';
import { Event, Integration } from '@sentry/types';
import { getEventDescription, isMatchingPattern, logger } from '@sentry/utils';

// "Script error." is hard coded into browsers for errors that it can't read.
// this is the result of a script being pulled in from an external domain and CORS.
const DEFAULT_IGNORE_ERRORS = [/^Script error\.?$/, /^Javascript error: Script error\.? on line 0$/];

/** JSDoc */
interface InboundFiltersOptions {
  allowUrls: Array<string | RegExp>;
  denyUrls: Array<string | RegExp>;
  ignoreErrors: Array<string | RegExp>;
  ignoreInternal: boolean;

  /** @deprecated use {@link InboundFiltersOptions.allowUrls} instead. */
  whitelistUrls: Array<string | RegExp>;
  /** @deprecated use {@link InboundFiltersOptions.denyUrls} instead. */
  blacklistUrls: Array<string | RegExp>;
}

/** Inbound filters configurable by the user */
export class InboundFilters implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'InboundFilters';

  /**
   * @inheritDoc
   */
  public name: string = InboundFilters.id;

  public constructor(private readonly _options: Partial<InboundFiltersOptions> = {}) {}

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
        // This checks prevents most of the occurrences of the bug linked below:
        // https://github.com/getsentry/sentry-javascript/issues/2622
        // The bug is caused by multiple SDK instances, where one is minified and one is using non-mangled code.
        // Unfortunatelly we cannot fix it reliably (thus reserved property in rollup's terser config),
        // as we cannot force people using multiple instances in their apps to sync SDK versions.
        const options = typeof self._mergeOptions === 'function' ? self._mergeOptions(clientOptions) : {};
        if (typeof self._shouldDropEvent !== 'function') {
          return event;
        }
        return self._shouldDropEvent(event, options) ? null : event;
      }
      return event;
    });
  }

  /** JSDoc */
  private _shouldDropEvent(event: Event, options: Partial<InboundFiltersOptions>): boolean {
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
    if (this._isDeniedUrl(event, options)) {
      logger.warn(
        `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }
    if (!this._isAllowedUrl(event, options)) {
      logger.warn(
        `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
          event,
        )}.\nUrl: ${this._getEventFilterUrl(event)}`,
      );
      return true;
    }
    return false;
  }

  /** JSDoc */
  private _isSentryError(event: Event, options: Partial<InboundFiltersOptions>): boolean {
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
  private _isIgnoredError(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    if (!options.ignoreErrors || !options.ignoreErrors.length) {
      return false;
    }

    return this._getPossibleEventMessages(event).some(message =>
      // Not sure why TypeScript complains here...
      (options.ignoreErrors as Array<RegExp | string>).some(pattern => isMatchingPattern(message, pattern)),
    );
  }

  /** JSDoc */
  private _isDeniedUrl(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    // TODO: Use Glob instead?
    if (!options.denyUrls || !options.denyUrls.length) {
      return false;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? false : options.denyUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private _isAllowedUrl(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    // TODO: Use Glob instead?
    if (!options.allowUrls || !options.allowUrls.length) {
      return true;
    }
    const url = this._getEventFilterUrl(event);
    return !url ? true : options.allowUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private _mergeOptions(clientOptions: Partial<InboundFiltersOptions> = {}): Partial<InboundFiltersOptions> {
    return {
      allowUrls: [
        // eslint-disable-next-line deprecation/deprecation
        ...(this._options.whitelistUrls || []),
        ...(this._options.allowUrls || []),
        // eslint-disable-next-line deprecation/deprecation
        ...(clientOptions.whitelistUrls || []),
        ...(clientOptions.allowUrls || []),
      ],
      denyUrls: [
        // eslint-disable-next-line deprecation/deprecation
        ...(this._options.blacklistUrls || []),
        ...(this._options.denyUrls || []),
        // eslint-disable-next-line deprecation/deprecation
        ...(clientOptions.blacklistUrls || []),
        ...(clientOptions.denyUrls || []),
      ],
      ignoreErrors: [
        ...(this._options.ignoreErrors || []),
        ...(clientOptions.ignoreErrors || []),
        ...DEFAULT_IGNORE_ERRORS,
      ],
      ignoreInternal: typeof this._options.ignoreInternal !== 'undefined' ? this._options.ignoreInternal : true,
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
