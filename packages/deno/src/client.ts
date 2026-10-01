import type { ServerRuntimeClientOptions } from '@sentry/core';
import {
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_flushMetricsBuffer,
  SDK_VERSION,
  ServerRuntimeClient,
} from '@sentry/core';
import process from 'node:process';
import type { DenoClientOptions } from './types';

function getHostName(): string | undefined {
  // Deno.permissions.querySync is not available on Deno Deploy
  if (!Deno.permissions.querySync) {
    return undefined;
  }

  const result = Deno.permissions.querySync({ name: 'sys', kind: 'hostname' });
  return result.state === 'granted' ? Deno.hostname() : undefined;
}

/**
 * The Sentry Deno SDK Client.
 *
 * @see DenoClientOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class DenoClient extends ServerRuntimeClient<DenoClientOptions> {
  private _logOnExitFlushListener: (() => void) | undefined;
  private _metricsOnExitFlushListener: (() => void) | undefined;

  /**
   * Creates a new Deno SDK instance.
   * @param options Configuration options for this SDK.
   */
  public constructor(options: DenoClientOptions) {
    options._metadata = options._metadata || {};
    options._metadata.sdk = options._metadata.sdk || {
      name: 'sentry.javascript.deno',
      packages: [
        {
          name: 'denoland:sentry',
          version: SDK_VERSION,
        },
      ],
      version: SDK_VERSION,
    };

    const serverName = options.serverName || getHostName();

    const clientOptions: ServerRuntimeClientOptions = {
      ...options,
      platform: 'javascript',
      runtime: { name: 'deno', version: Deno.version.deno },
      serverName,
    };

    super(clientOptions);

    if (this.getOptions().enableLogs) {
      this._logOnExitFlushListener = () => {
        _INTERNAL_flushLogsBuffer(this);
      };

      if (serverName) {
        this.on('beforeCaptureLog', log => {
          log.attributes = {
            ...log.attributes,
            'server.address': serverName,
          };
        });
      }

      // Unlike unload, beforeExit lets the transport finish asynchronous sends.
      process.on('beforeExit', this._logOnExitFlushListener);
      globalThis.addEventListener('unload', this._logOnExitFlushListener);
    }

    this._metricsOnExitFlushListener = () => {
      _INTERNAL_flushMetricsBuffer(this);
    };
    process.on('beforeExit', this._metricsOnExitFlushListener);
    globalThis.addEventListener('unload', this._metricsOnExitFlushListener);
  }

  /** @inheritDoc */
  // @ts-expect-error - PromiseLike is a subset of Promise
  public async close(timeout?: number | undefined): PromiseLike<boolean> {
    if (this._logOnExitFlushListener) {
      process.off('beforeExit', this._logOnExitFlushListener);
      globalThis.removeEventListener('unload', this._logOnExitFlushListener);
    }

    if (this._metricsOnExitFlushListener) {
      process.off('beforeExit', this._metricsOnExitFlushListener);
      globalThis.removeEventListener('unload', this._metricsOnExitFlushListener);
    }

    return super.close(timeout);
  }
}
