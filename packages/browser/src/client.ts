import type {
  BrowserClientProfilingOptions,
  BrowserClientReplayOptions,
  ClientOptions,
  Event,
  EventHint,
  Options,
  ParameterizedString,
  Scope,
  SeverityLevel,
} from '@sentry/core';
import {
  _INTERNAL_flushLogsBuffer,
  addAutoIpAddressToSession,
  addAutoIpAddressToUser,
  applySdkMetadata,
  Client,
  getSDKSource,
} from '@sentry/core';
import { eventFromException, eventFromMessage } from './eventbuilder';
import { WINDOW } from './helpers';
import type { BrowserTransportOptions } from './transports/types';

/**
 * A magic string that build tooling can leverage in order to inject a release value into the SDK.
 */
declare const __SENTRY_RELEASE__: string | undefined;

const DEFAULT_FLUSH_INTERVAL = 5000;

type BrowserSpecificOptions = BrowserClientReplayOptions &
  BrowserClientProfilingOptions & {
    /** If configured, this URL will be used as base URL for lazy loading integration. */
    cdnBaseUrl?: string;
  };
/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/core Options for more information.
 */
export type BrowserOptions = Options<BrowserTransportOptions> &
  BrowserSpecificOptions & {
    /**
     * Important: Only set this option if you know what you are doing!
     *
     * By default, the SDK will check if `Sentry.init` is called in a browser extension.
     * In case it is, it will stop initialization and log a warning
     * because browser extensions require a different Sentry initialization process:
     * https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/
     *
     * Setting up the SDK in a browser extension with global error monitoring is not recommended
     * and will likely flood you with errors from other web sites or extensions. This can heavily
     * impact your quota and cause interference with your and other Sentry SDKs in shared environments.
     *
     * If this check wrongfully flags your setup as a browser extension, you can set this
     * option to `true` to skip the check.
     *
     * @default false
     */
    skipBrowserExtensionCheck?: boolean;
  };

/**
 * Configuration options for the Sentry Browser SDK Client class
 * @see BrowserClient for more information.
 */
export type BrowserClientOptions = ClientOptions<BrowserTransportOptions> & BrowserSpecificOptions;

/**
 * The Sentry Browser SDK Client.
 *
 * @see BrowserOptions for documentation on configuration options.
 * @see SentryClient for usage documentation.
 */
export class BrowserClient extends Client<BrowserClientOptions> {
  private _logFlushIdleTimeout: ReturnType<typeof setTimeout> | undefined;
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserClientOptions) {
    const opts = applyDefaultOptions(options);
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();
    applySdkMetadata(opts, 'browser', ['browser'], sdkSource);

    super(opts);

    const { sendDefaultPii, sendClientReports, enableLogs, _experiments } = this._options;
    // eslint-disable-next-line deprecation/deprecation
    const shouldEnableLogs = enableLogs ?? _experiments?.enableLogs;

    if (WINDOW.document && (sendClientReports || shouldEnableLogs)) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          if (sendClientReports) {
            this._flushOutcomes();
          }
          if (shouldEnableLogs) {
            _INTERNAL_flushLogsBuffer(this);
          }
        }
      });
    }

    if (shouldEnableLogs) {
      this.on('flush', () => {
        _INTERNAL_flushLogsBuffer(this);
      });

      this.on('afterCaptureLog', () => {
        if (this._logFlushIdleTimeout) {
          clearTimeout(this._logFlushIdleTimeout);
        }

        this._logFlushIdleTimeout = setTimeout(() => {
          _INTERNAL_flushLogsBuffer(this);
        }, DEFAULT_FLUSH_INTERVAL);
      });
    }

    if (sendDefaultPii) {
      this.on('postprocessEvent', addAutoIpAddressToUser);
      this.on('beforeSendSession', addAutoIpAddressToSession);
    }
  }

  /**
   * @inheritDoc
   */
  public eventFromException(exception: unknown, hint?: EventHint): PromiseLike<Event> {
    return eventFromException(this._options.stackParser, exception, hint, this._options.attachStacktrace);
  }

  /**
   * @inheritDoc
   */
  public eventFromMessage(
    message: ParameterizedString,
    level: SeverityLevel = 'info',
    hint?: EventHint,
  ): PromiseLike<Event> {
    return eventFromMessage(this._options.stackParser, message, level, hint, this._options.attachStacktrace);
  }

  /**
   * @inheritDoc
   */
  protected _prepareEvent(
    event: Event,
    hint: EventHint,
    currentScope: Scope,
    isolationScope: Scope,
  ): PromiseLike<Event | null> {
    event.platform = event.platform || 'javascript';

    return super._prepareEvent(event, hint, currentScope, isolationScope);
  }
}

/** Exported only for tests. */
export function applyDefaultOptions<T extends Partial<BrowserClientOptions>>(optionsArg: T): T {
  return {
    release:
      typeof __SENTRY_RELEASE__ === 'string' // This allows build tooling to find-and-replace __SENTRY_RELEASE__ to inject a release value
        ? __SENTRY_RELEASE__
        : WINDOW.SENTRY_RELEASE?.id, // This supports the variable that sentry-webpack-plugin injects
    sendClientReports: true,
    // We default this to true, as it is the safer scenario
    parentSpanIsAlwaysRootSpan: true,
    ...optionsArg,
  };
}
