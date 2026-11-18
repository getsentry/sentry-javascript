import { SERVER_ADDRESS } from '@sentry/conventions/attributes';
import type { ServerRuntimeClientOptions } from '@sentry/core/server';
import { SDK_VERSION } from '@sentry/core';
import { ServerRuntimeClient } from '@sentry/core/server';
import { registerDiagnosticsChannelInjection } from '@sentry/server-runtime-injection/register';
import { setAsyncLocalStorageAsyncContextStrategy } from '@sentry/server-utils';
import process from 'node:process';
import type { DenoClientOptions } from './types';

declare const __SENTRY_CHANNEL_INJECTION__: boolean | undefined;

const DEFAULT_CLIENT_REPORT_FLUSH_INTERVAL_MS = 60_000;

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
  private _clientReportInterval: number | undefined;
  private _clientReportOnExitFlushListener: (() => void) | undefined;

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
          [SERVER_ADDRESS]: serverName,
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
  public flush(timeout?: number): PromiseLike<boolean> {
    if (this.getOptions().sendClientReports) {
      this._flushOutcomes();
    }

    return super.flush(timeout);
  }

  /** @inheritDoc */
  // @ts-expect-error - PromiseLike is a subset of Promise
  public async close(timeout?: number | undefined): PromiseLike<boolean> {
    if (this._clientReportInterval !== undefined) {
      clearInterval(this._clientReportInterval);
    }

    if (this._clientReportOnExitFlushListener) {
      process.off('beforeExit', this._clientReportOnExitFlushListener);
    }

    if (this._onExitFlushListener) {
      process.off('beforeExit', this._onExitFlushListener);
      globalThis.removeEventListener('unload', this._onExitFlushListener);
    }

    return super.close(timeout);
  }

  /**
   * Starts sending client reports: on an interval, and before the process exits.
   *
   * `init()` calls this. It is not in the constructor, so that creating many clients does not
   * leak intervals and listeners. Call `close()` on a client that is no longer used.
   */
  public startClientReportTracking(): void {
    const options = this.getOptions();
    if (!options.sendClientReports) {
      return;
    }

    this._clientReportOnExitFlushListener = () => {
      this._flushOutcomes();
    };

    // `setInterval` returns a number in Deno. `@types/node` types it as `NodeJS.Timeout`.
    this._clientReportInterval = setInterval(() => {
      this._flushOutcomes();
    }, options.clientReportFlushInterval ?? DEFAULT_CLIENT_REPORT_FLUSH_INTERVAL_MS) as unknown as number;
    // An unref'd interval does not keep the process alive.
    Deno.unrefTimer(this._clientReportInterval);

    process.on('beforeExit', this._clientReportOnExitFlushListener);
  }
}
