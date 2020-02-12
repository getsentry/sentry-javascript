import { Event, EventHint, EventProcessor, Hub, Integration } from '@sentry/types';
import { isPlainObject, isRegExp, normalize } from '@sentry/utils';

/** JSDoc */
interface ScrubberOptions {
  sanitizeKeys: Array<string | RegExp>;
}

/** JSDoc */
export class Scrubber implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Scrubber.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Scrubber';

  /** JSDoc */
  private readonly _options: ScrubberOptions;
  private readonly _sanitizeMask: string;
  private _lazySanitizeRegExp?: RegExp;

  /**
   * @inheritDoc
   */
  public constructor(options: ScrubberOptions) {
    this._options = {
      sanitizeKeys: [],
      ...options,
    };
    this._sanitizeMask = '********';
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor((event: Event, _hint?: EventHint) => {
      const self = getCurrentHub().getIntegration(Scrubber);
      if (self) {
        return self.process(event);
      }
      return event;
    });
  }

  /** JSDoc */
  public process(event: Event): Event {
    if (this._options.sanitizeKeys.length === 0) {
      // nothing to sanitize
      return event;
    }

    return this._sanitize(normalize(event)) as Event;
  }

  /**
   * lazily generate regexp
   */
  private _sanitizeRegExp(): RegExp {
    if (this._lazySanitizeRegExp) {
      return this._lazySanitizeRegExp;
    }

    const sources = this._options.sanitizeKeys.reduce(
      (acc, key) => {
        if (typeof key === 'string') {
          // escape string value
          // see also: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
          acc.push(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        } else if (isRegExp(key)) {
          acc.push(key.source);
        }
        return acc;
      },
      [] as string[],
    );

    return (this._lazySanitizeRegExp = RegExp(sources.join('|'), 'i'));
  }

  /**
   * sanitize event data recursively
   */
  private _sanitize(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map(value => this._sanitize(value));
    }

    if (isPlainObject(input)) {
      const inputVal = input as { [key: string]: unknown };
      return Object.keys(inputVal).reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = this._sanitizeRegExp().test(key) ? this._sanitizeMask : this._sanitize(inputVal[key]);
        return acc;
      }, {});
    }
    return input;
  }
}
