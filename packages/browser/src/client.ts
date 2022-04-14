import { BaseClient, getEnvelopeEndpointWithUrlEncodedAuth, initAPIDetails, Scope, SDK_VERSION } from '@sentry/core';
import { Event, EventHint, Options, Severity, SeverityLevel, Transport, TransportOptions } from '@sentry/types';
import { getGlobalObject, logger, stackParserFromOptions, supportsFetch } from '@sentry/utils';

import { eventFromException, eventFromMessage } from './eventbuilder';
import { IS_DEBUG_BUILD } from './flags';
import { injectReportDialog, ReportDialogOptions } from './helpers';
import { Breadcrumbs } from './integrations';
import { FetchTransport, makeNewFetchTransport, makeNewXHRTransport, XHRTransport } from './transports';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see BrowserClient for more information.
 */
export interface BrowserOptions extends Options {
  /**
   * A pattern for error URLs which should exclusively be sent to Sentry.
   * This is the opposite of {@link Options.denyUrls}.
   * By default, all errors will be sent.
   */
  allowUrls?: Array<string | RegExp>;

  /**
   * A pattern for error URLs which should not be sent to Sentry.
   * To allow certain errors instead, use {@link Options.allowUrls}.
   * By default, all errors will be sent.
   */
  denyUrls?: Array<string | RegExp>;
}

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends BaseClient<BrowserOptions> {
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserOptions = {}) {
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
  }

  /**
   * Show a report dialog to the user to send feedback to a specific event.
   *
   * @param options Set individual options for the dialog
   */
  public showReportDialog(options: ReportDialogOptions = {}): void {
    // doesn't work without a document (React Native)
    const document = getGlobalObject<Window>().document;
    if (!document) {
      return;
    }

    if (!this._isEnabled()) {
      IS_DEBUG_BUILD && logger.error('Trying to call showReportDialog with Sentry Client disabled');
      return;
    }

    injectReportDialog({
      ...options,
      dsn: options.dsn || this.getDsn(),
    });
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(stackParserFromOptions(this._options), exception, hint, this._options.attachStacktrace);
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
    return eventFromMessage(
      stackParserFromOptions(this._options),
      message,
      level,
      hint,
      this._options.attachStacktrace,
    );
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';
    return super._prepareEvent(event, scope, hint);
  }

  /**
   * @inheritDoc
   */
  protected _sendEvent(event: Event): void {
    const integration = this.getIntegration(Breadcrumbs);
    if (integration) {
      integration.addSentryBreadcrumb(event);
    }
    super._sendEvent(event);
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const transportOptions: TransportOptions = {
      ...this._options.transportOptions,
      dsn: this._options.dsn,
      tunnel: this._options.tunnel,
      sendClientReports: this._options.sendClientReports,
      _metadata: this._options._metadata,
    };

    const api = initAPIDetails(transportOptions.dsn, transportOptions._metadata, transportOptions.tunnel);
    const url = getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel);

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    if (supportsFetch()) {
      const requestOptions: RequestInit = { ...transportOptions.fetchParameters };
      this._newTransport = makeNewFetchTransport({ requestOptions, url });
      return new FetchTransport(transportOptions);
    }

    this._newTransport = makeNewXHRTransport({
      url,
      headers: transportOptions.headers,
    });
    return new XHRTransport(transportOptions);
  }
}
