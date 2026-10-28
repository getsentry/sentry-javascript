import type { ServerRuntimeClientOptions } from '@sentry/core/server';
import { SDK_VERSION } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import { registerDiagnosticsChannelInjection } from '@sentry/server-runtime-injection/register';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import process from 'node:process';
import type { DenoClientOptions } from './types';

declare const __SENTRY_CHANNEL_INJECTION__: boolean | undefined;

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
  private _onExitFlushListener: (() => void) | undefined;

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

    // The log, metric and span buffers drain on `flush`. Their timers are unref'd, so a natural exit
    // would drop what they hold.
    this._onExitFlushListener = () => {
      this.emit('flush');
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
    process.on('beforeExit', this._onExitFlushListener);
    globalThis.addEventListener('unload', this._onExitFlushListener);

    // In the constructor, as in `NodeClient`, so a directly constructed client installs the hooks
    // too. Registration is idempotent.
    if (
      (typeof __SENTRY_CHANNEL_INJECTION__ === 'undefined' || __SENTRY_CHANNEL_INJECTION__) &&
      options.enableRuntimeChannelInjection !== false
    ) {
      registerDiagnosticsChannelInjection();
    }
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
    if (this._onExitFlushListener) {
      process.off('beforeExit', this._onExitFlushListener);
      globalThis.removeEventListener('unload', this._onExitFlushListener);
    }

    return super.close(timeout);
  }
}
