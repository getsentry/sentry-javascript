import { BaseClient, Scope, SDK_VERSION } from '@sentry/core';
import { SessionFlusher } from '@sentry/hub';
import { Event, EventHint, SeverityLevel, Transport, TransportOptions } from '@sentry/types';
import { Dsn, logger } from '@sentry/utils';

import { eventFromException, eventFromMessage } from './eventbuilder';
import { HTTPSTransport, HTTPTransport } from './transports';
import { NodeOptions } from './types';

/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeClient extends BaseClient<NodeOptions> {
  protected _sessionFlusher: SessionFlusher | undefined;

  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: NodeOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.node',
      packages: [
        {
          name: 'npm:@sentry/node',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    super(options);
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  public captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined {
    // Check if the flag `autoSessionTracking` is enabled, and if `_sessionFlusher` exists because it is initialised only
    // when the `requestHandler` middleware is used, and hence the expectation is to have SessionAggregates payload
    // sent to the Server only when the `requestHandler` middleware is used
    if (this._options.autoSessionTracking && this._sessionFlusher && scope) {
      const requestSession = scope.getRequestSession();

      // Necessary checks to ensure this is code block is executed only within a request
      // Should override the status only if `requestSession.status` is `Ok`, which is its initial stage
      if (requestSession && requestSession.status === 'ok') {
        requestSession.status = 'errored';
      }
    }

    return super.captureException(exception, hint, scope);
  }

  /**
   * @inheritDoc
   */
  public captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined {
    // Check if the flag `autoSessionTracking` is enabled, and if `_sessionFlusher` exists because it is initialised only
    // when the `requestHandler` middleware is used, and hence the expectation is to have SessionAggregates payload
    // sent to the Server only when the `requestHandler` middleware is used
    if (this._options.autoSessionTracking && this._sessionFlusher && scope) {
      const eventType = event.type || 'exception';
      const isException =
        eventType === 'exception' && event.exception && event.exception.values && event.exception.values.length > 0;

      // If the event is of type Exception, then a request session should be captured
      if (isException) {
        const requestSession = scope.getRequestSession();

        // Ensure that this is happening within the bounds of a request, and make sure not to override
        // Session Status if Errored / Crashed
        if (requestSession && requestSession.status === 'ok') {
          requestSession.status = 'errored';
        }
      }
    }

    return super.captureEvent(event, hint, scope);
  }

  /**
   *
   * @inheritdoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    this._sessionFlusher?.close();
    return super.close(timeout);
  }

  /** Method that initialises an instance of SessionFlusher on Client */
  public initSessionFlusher(): void {
    const { release, environment } = this._options;
    const transport = this.getTransport();

    if (!transport) {
      logger.warn('Cannot initialise an instance of SessionFlusher if no transport is initialized!');
      return;
    }
    if (!release) {
      logger.warn('Cannot initialise an instance of SessionFlusher if no release is provided!');
      return;
    }

    this._sessionFlusher = new SessionFlusher(transport, {
      release,
      environment,
    });
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(event: Event, scope?: Scope, hint?: EventHint): PromiseLike<Event | null> {
    event.platform = event.platform || 'node';
    if (this.getOptions().serverName) {
      event.server_name = this.getOptions().serverName;
    }
    return super._prepareEvent(event, scope, hint);
  }

  /**
   * Method responsible for capturing/ending a request session by calling `incrementSessionStatusCount` to increment
   * appropriate session aggregates bucket
   */
  protected _captureRequestSession(): void {
    if (!this._sessionFlusher) {
      logger.warn('Discarded request mode session because autoSessionTracking option was disabled');
    } else {
      this._sessionFlusher.incrementSessionStatusCount();
    }
  }

  /**
   * @inheritDoc
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  protected _eventFromException(exception: any, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options, exception, hint);
  }

  /**
   * @inheritDoc
   */
  protected _eventFromMessage(message: string, level: SeverityLevel = 'info', hint?: EventHint): PromiseLike<Event> {
    return eventFromMessage(this._options, message, level, hint);
  }

  /**
   * @inheritDoc
   */
  protected _setupTransport(): Transport {
    if (!this._options.dsn) {
      // We return the noop transport here in case there is no Dsn.
      return super._setupTransport();
    }

    const dsn = new Dsn(this._options.dsn);

    const transportOptions: TransportOptions = {
      ...this._options.transportOptions,
      ...(this._options.httpProxy && { httpProxy: this._options.httpProxy }),
      ...(this._options.httpsProxy && { httpsProxy: this._options.httpsProxy }),
      ...(this._options.caCerts && { caCerts: this._options.caCerts }),
      dsn: this._options.dsn,
      tunnel: this._options.tunnel,
      _metadata: this._options._metadata,
    };

    if (this._options.transport) {
      return new this._options.transport(transportOptions);
    }
    if (dsn.protocol === 'http') {
      return new HTTPTransport(transportOptions);
    }
    return new HTTPSTransport(transportOptions);
  }
}
