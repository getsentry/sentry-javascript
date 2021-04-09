import { BaseClient, Scope } from '@sentry/core';
import { Session, SessionFlusher } from '@sentry/hub';
import { Event, EventHint } from '@sentry/types';
import { logger } from '@sentry/utils';

import { NodeBackend, NodeOptions } from './backend';

/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
  protected _sessionFlusher: SessionFlusher | undefined;
  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: NodeOptions) {
    super(NodeBackend, options);
    if (options.autoSessionTracking) {
      const { release, environment } = this._options;
      if (release) {
        this._sessionFlusher = new SessionFlusher(this._backend.getTransport(), {
          release,
          environment,
        });
      }
    }
  }
  /**
   * @inheritDoc
   */
  public captureSession(session: Session): void {
    if (!session.release) {
      logger.warn('Discarded session because of missing release');
    } else {
      this._sendSession(session);
      // After sending, we set init false to inidcate it's not the first occurence
      session.update({ init: false });
    }
  }

  /**
   *
   * @inheritDoc
   */
  public captureRequestSession(): void {
    if (!this._sessionFlusher) {
      logger.warn('Discarded request mode session because autoSessionTracking option was disabled');
    } else {
      this._sessionFlusher.incrementSessionCount();
    }
  }

  /**
   *
   * @inheritdoc
   */
  public close(timeout?: number): PromiseLike<boolean> {
    this._sessionFlusher?.close();
    return super.close(timeout);
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
}
