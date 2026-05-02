import type { ServerRuntimeClientOptions } from '@sentry/core';
import { LightNodeClient } from '@sentry/node-core/light';

/**
 * A lightweight Sentry client for Bun without OpenTelemetry.
 *
 * Extends LightNodeClient to set Bun-specific runtime metadata.
 */
export class BunLightClient extends LightNodeClient {
  public constructor(options: ConstructorParameters<typeof LightNodeClient>[0]) {
    super(options);

    // LightNodeClient hardcodes runtime/platform for Node.js in its constructor.
    // We override them here to reflect the Bun runtime instead.
    const clientOptions = this.getOptions() as ServerRuntimeClientOptions;
    clientOptions.runtime = { name: 'bun', version: typeof Bun !== 'undefined' ? Bun.version : 'unknown' };
    clientOptions.platform = 'javascript';
  }
}
