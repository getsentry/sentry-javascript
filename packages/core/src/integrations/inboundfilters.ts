import { addGlobalEventProcessor, getHubClient, getCurrentHub, getHubIntegration } from '@sentry/hub';
import { Event, Integration, StackFrame } from '@sentry/types';
import { getEventDescription, isDebugBuild, isMatchingPattern, logger } from '@sentry/utils';

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
      // TODO: this is really confusing, why would ask back the integration?
      // setupOnce() belongs already to `self` (this) so it is confusing to ask for it. No?
      const self = getHubIntegration(hub, InboundFilters);
      if (self) {
        const client = getHubClient(hub);
        const clientOptions = client ? client.getOptions() : {};
        // This checks prevents most of the occurrences of the bug linked below:
        // https://github.com/getsentry/sentry-javascript/issues/2622
        // The bug is caused by multiple SDK instances, where one is minified and one is using non-mangled code.
        // Unfortunatelly we cannot fix it reliably (thus reserved property in rollup's terser config),
        // as we cannot force people using multiple instances in their apps to sync SDK versions.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const options = typeof self._mergeOptions === 'function' ? self._mergeOptions(clientOptions) : {};
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof self._shouldDropEvent !== 'function') {
          return event;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return self._shouldDropEvent(event, options) ? null : event;
      }
      return event;
    });
  }

  /** JSDoc */
  public _shouldDropEvent(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    if (isSentryError(event, options)) {
      if (isDebugBuild()) {
        logger.warn(`Event dropped due to being internal Sentry Error.\nEvent: ${getEventDescription(event)}`);
      }
      return true;
    }
    if (this._isIgnoredError(event, options)) {
      if (isDebugBuild()) {
        logger.warn(
          `Event dropped due to being matched by \`ignoreErrors\` option.\nEvent: ${getEventDescription(event)}`,
        );
      }
      return true;
    }
    if (this._isDeniedUrl(event, options)) {
      if (isDebugBuild()) {
        logger.warn(
          `Event dropped due to being matched by \`denyUrls\` option.\nEvent: ${getEventDescription(
            event,
          )}.\nUrl: ${getEventFilterUrl(event)}`,
        );
      }
      return true;
    }
    if (!this._isAllowedUrl(event, options)) {
      if (isDebugBuild()) {
        logger.warn(
          `Event dropped due to not being matched by \`allowUrls\` option.\nEvent: ${getEventDescription(
            event,
          )}.\nUrl: ${getEventFilterUrl(event)}`,
        );
      }
      return true;
    }
    return false;
  }

  /** JSDoc */
  public _mergeOptions(clientOptions: Partial<InboundFiltersOptions> = {}): Partial<InboundFiltersOptions> {
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
  private _isIgnoredError(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    if (!options.ignoreErrors || !options.ignoreErrors.length) {
      return false;
    }

    return getPossibleEventMessages(event).some(message =>
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
    const url = getEventFilterUrl(event);
    return !url ? false : options.denyUrls.some(pattern => isMatchingPattern(url, pattern));
  }

  /** JSDoc */
  private _isAllowedUrl(event: Event, options: Partial<InboundFiltersOptions>): boolean {
    // TODO: Use Glob instead?
    if (!options.allowUrls || !options.allowUrls.length) {
      return true;
    }
    const url = getEventFilterUrl(event);
    return !url ? true : options.allowUrls.some(pattern => isMatchingPattern(url, pattern));
  }
}

/** JSDoc */
function getEventFilterUrl(event: Event): string | null {
  try {
    if (event.stacktrace) {
      return getLastValidUrl(event.stacktrace.frames);
    }
    let frames;
    try {
      // @ts-ignore we only care about frames if the whole thing here is defined
      frames = event.exception.values[0].stacktrace.frames;
    } catch (e) {
      // ignore
    }
    return frames ? getLastValidUrl(frames) : null;
  } catch (oO) {
    if (isDebugBuild()) {
      logger.error(`Cannot extract url for event ${getEventDescription(event)}`);
    }
    return null;
  }
}

/** JSDoc */
function getPossibleEventMessages(event: Event): string[] {
  if (event.message) {
    return [event.message];
  }
  if (event.exception) {
    try {
      const { type = '', value = '' } = (event.exception.values && event.exception.values[0]) || {};
      return [`${value}`, `${type}: ${value}`];
    } catch (oO) {
      if (isDebugBuild()) {
        logger.error(`Cannot extract message for event ${getEventDescription(event)}`);
      }
      return [];
    }
  }
  return [];
}

/** JSDoc */
function getLastValidUrl(frames: StackFrame[] = []): string | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];

    if (frame && frame.filename !== '<anonymous>' && frame.filename !== '[native code]') {
      return frame.filename || null;
    }
  }

  return null;
}

/** JSDoc */
function isSentryError(event: Event, options: Partial<InboundFiltersOptions>): boolean {
  if (!options.ignoreInternal) {
    return false;
  }

  try {
    // @ts-ignore can't be a sentry error if undefined
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return event.exception.values[0].type === 'SentryError';
  } catch (e) {
    // ignore
  }

  return false;
}
