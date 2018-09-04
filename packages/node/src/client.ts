import { BaseClient } from '@sentry/core';
import { NodeBackend, NodeOptions } from './backend';

/**
 * The Sentry Node SDK Client.
 *
 * @see NodeOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class NodeClient extends BaseClient<NodeBackend, NodeOptions> {
  /**
   * Creates a new Node SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: NodeOptions) {
    super(NodeBackend, options);
  }

  /**
   * A promise that resolves whenever the request buffer is empty.
   * If you provide a timeout and the buffer takes longer to drain the promise returns false.
   * The promise only rejects if {@link Backend.close} is not implemented.
   *
   * @param timeout Maximum time in ms the client should wait.
   */
  public async close(timeout?: number): Promise<boolean> {
    return this.getBackend().close ? this.getBackend().close(timeout) : Promise.resolve(false);
  }
}
