import type { BaseTransportOptions, ClientOptions, Options } from '@sentry/core';
import type { ServerRuntimeOptions } from '@sentry/node-core';

/**
 * Base options for the Sentry Bun SDK.
 * Extends the common WinterTC options shared with Node.js and other server-side SDKs.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BaseBunOptions extends ServerRuntimeOptions {}

/**
 * Configuration options for the Sentry Bun SDK
 * @see @sentry/core Options for more information.
 */
export interface BunOptions extends Options<BaseTransportOptions>, BaseBunOptions {}

/**
 * Configuration options for the Sentry Bun SDK Client class
 * @see BunClient for more information.
 */
export interface BunClientOptions extends ClientOptions<BaseTransportOptions>, BaseBunOptions {}
