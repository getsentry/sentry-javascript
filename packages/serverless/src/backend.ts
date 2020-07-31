import { NodeOptions, NodeBackend } from '@sentry/node/dist/backend';

/**
 * Configuration options for the Sentry Serverless SDK.
 * @see ServerlessClient for more information.
 */
export interface ServerlessOptions extends NodeOptions {
  /** handler */
  aws_context?: string;
}

/**
 * The Sentry Node SDK Backend.
 * @hidden
 */
export class ServerlessBackend extends NodeBackend {}
