import type { ServerRuntimeClientOptions } from '@sentry/core';
import { _INTERNAL_flushLogsBuffer, SDK_VERSION, ServerRuntimeClient } from '@sentry/core';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
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

    globalThis.addEventListener('unload', this._logOnExitFlushListener);
  }

  /** @inheritDoc */
  public init(): void {
    // The channel-based default integrations propagate scope across async
    // boundaries via Deno's AsyncLocalStorage context strategy. Install it here,
    // the setup path both `Sentry.init()` and a directly-constructed client run
    // through, so it is in place before the integrations subscribe.
    setAsyncLocalStorageAsyncContextStrategy();
    super.init();
  }

  /** @inheritDoc */
  // @ts-expect-error - PromiseLike is a subset of Promise
  public async close(timeout?: number | undefined): PromiseLike<boolean> {
    if (this._logOnExitFlushListener) {
      globalThis.removeEventListener('unload', this._logOnExitFlushListener);
    }

    return super.close(timeout);
  }
}
