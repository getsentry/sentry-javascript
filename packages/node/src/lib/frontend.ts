import { FrontendBase, Sdk } from '@sentry/core';
import { NodeBackend, NodeOptions } from './backend';
import { Raven } from './raven';

/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeFrontend extends FrontendBase<NodeBackend, NodeOptions> {
  /** TODO */
  public constructor(options: NodeOptions) {
    super(NodeBackend, options);
  }

  /**
   * @inheritDoc
   */
  // tslint:disable-next-line:prefer-function-over-method
  public async captureException(exception: any): Promise<void> {
    Raven.captureException(exception);
  }

  /**
   * @inheritDoc
   */
  // tslint:disable-next-line:prefer-function-over-method
  public async captureMessage(message: string): Promise<void> {
    Raven.captureMessage(message);
  }
}

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link Sdk.create} function as early as possible
 * in the main entry module. To set context information or send manual events,
 * use the provided methods.
 *
 * @example
 * const { SentryClient } = require('@sentry/node');
 *
 * SentryClient.create({
 *   dsn: '__DSN__',
 *   // ...
 * });
 *
 * SentryClient.captureMessage('Hello, world');
 *
 * @see NodeOptions for documentation on configuration options.
 */
// tslint:disable-next-line:variable-name
export const SentryClient = new Sdk(NodeFrontend);
