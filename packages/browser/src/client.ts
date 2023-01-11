import type { Scope } from '@sentry/core';
import { BaseClient, getEnvelopeEndpointWithUrlEncodedAuth, SDK_VERSION } from '@sentry/core';
import type {
  BrowserClientReplayOptions,
  ClientOptions,
  Event,
  EventHint,
  Options,
  Severity,
  SeverityLevel,
} from '@sentry/types';
import { createClientReportEnvelope, dsnToString, logger, serializeEnvelope } from '@sentry/utils';

import { eventFromException, eventFromMessage } from './eventbuilder';
import { WINDOW } from './helpers';
import type { Breadcrumbs } from './integrations';
import { BREADCRUMB_INTEGRATION_ID } from './integrations/breadcrumbs';
import type { BrowserTransportOptions } from './transports/types';
/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/types Options for more information.
 */
export type BrowserOptions = Options<BrowserTransportOptions> & BrowserClientReplayOptions;

/**
 * Configuration options for the Sentry Browser SDK Client class
 * @see BrowserClient for more information.
 */
export type BrowserClientOptions = ClientOptions<BrowserTransportOptions>;

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
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.browser',
      packages: [
        {
          name: 'npm:@sentry/browser',
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
   * @inheritDoc
   */
  public sendEvent(event: Event, hint?: EventHint): void {
    // We only want to add the sentry event breadcrumb when the user has the breadcrumb integration installed and
    // activated its `sentry` option.
    // We also do not want to use the `Breadcrumbs` class here directly, because we do not want it to be included in
    // bundles, if it is not used by the SDK.
    // This all sadly is a bit ugly, but we currently don't have a "pre-send" hook on the integrations so we do it this
    // way for now.
    const breadcrumbIntegration = this.getIntegrationById(BREADCRUMB_INTEGRATION_ID) as Breadcrumbs | undefined;
    // We check for definedness of `addSentryBreadcrumb` in case users provided their own integration with id
    // "Breadcrumbs" that does not have this function.
    breadcrumbIntegration?.addSentryBreadcrumb?.(event);

    super.sendEvent(event, hint);
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

    const url = getEnvelopeEndpointWithUrlEncodedAuth(this._dsn, this._options);
    const envelope = createClientReportEnvelope(outcomes, this._options.tunnel && dsnToString(this._dsn));

    try {
      const isRealNavigator = Object.prototype.toString.call(WINDOW && WINDOW.navigator) === '[object Navigator]';
      const hasSendBeacon = isRealNavigator && typeof WINDOW.navigator.sendBeacon === 'function';
      // Make sure beacon is not used if user configures custom transport options
      if (hasSendBeacon && !this._options.transportOptions) {
        // Prevent illegal invocations - https://xgwang.me/posts/you-may-not-know-beacon/#it-may-throw-error%2C-be-sure-to-catch
        const sendBeacon = WINDOW.navigator.sendBeacon.bind(WINDOW.navigator);
        sendBeacon(url, serializeEnvelope(envelope));
      } else {
        // If beacon is not supported or if they are using the tunnel option
        // use our regular transport to send client reports to Sentry.
        this._sendEnvelope(envelope);
      }
    } catch (e) {
      __DEBUG_BUILD__ && logger.error(e);
    }
  }
}
