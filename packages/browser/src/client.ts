import type { Scope } from '@sentry/core';
import { BaseClient, SDK_VERSION } from '@sentry/core';
import type {
  BrowserClientProfilingOptions,
  BrowserClientReplayOptions,
  ClientOptions,
  Event,
  EventHint,
  Options,
  Severity,
  SeverityLevel,
  UserFeedback,
} from '@sentry/types';
import { createClientReportEnvelope, dsnToString, getSDKSource, logger } from '@sentry/utils';

import { eventFromException, eventFromMessage } from './eventbuilder';
import { WINDOW } from './helpers';
import type { BrowserTransportOptions } from './transports/types';
import { createUserFeedbackEnvelope } from './userfeedback';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/types Options for more information.
 */
export type BrowserOptions = Options<BrowserTransportOptions> &
  BrowserClientReplayOptions &
  BrowserClientProfilingOptions;

/**
 * Configuration options for the Sentry Browser SDK Client class
 * @see BrowserClient for more information.
 */
export type BrowserClientOptions = ClientOptions<BrowserTransportOptions> &
  BrowserClientReplayOptions &
  BrowserClientProfilingOptions;

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends BaseClient<BrowserClientOptions> {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserClientOptions) {
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();

    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: `${sdkSource}:@sentry/browser`,
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    super(options);

    if (options.sendClientReports && WINDOW.document) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          this._flushOutcomes();
        }
      });
    }
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
  }

  /**
   * Sends user feedback to Sentry.
   */
  public captureUserFeedback(feedback: UserFeedback): void {
    if (!this._isEnabled()) {
      __DEBUG_BUILD__ && logger.warn('SDK not enabled, will not capture user feedback.');
      return;
    }

    const envelope = createUserFeedbackEnvelope(feedback, {
      metadata: this.getSdkMetadata(),
      dsn: this.getDsn(),
      tunnel: this.getOptions().tunnel,
    });
    void this._sendEnvelope(envelope);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, hint: EventHint, scope?: Scope): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';
    return super._prepareEvent(event, hint, scope);
  }

  /**
   * Sends client reports as an envelope.
   */
  private _flushOutcomes(): void {
    const outcomes = this._clearOutcomes();

    if (outcomes.length === 0) {
      __DEBUG_BUILD__ && logger.log('No outcomes to send');
      return;
    }

    if (!this._dsn) {
      __DEBUG_BUILD__ && logger.log('No dsn provided, will not send outcomes');
      return;
    }

    __DEBUG_BUILD__ && logger.log('Sending outcomes:', outcomes);

    const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));
    void this._sendEnvelope(envelope);
  }
}
