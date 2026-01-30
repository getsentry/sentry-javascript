import type {
  BrowserClientProfilingOptions,
  BrowserClientReplayOptions,
  ClientOptions,
  Event,
  EventHint,
  Options as CoreOptions,
  ParameterizedString,
  Scope,
  SeverityLevel,
} from '@sentry/core';
import {
  _INTERNAL_flushLogsBuffer,
  _INTERNAL_flushMetricsBuffer,
  addAutoIpAddressToSession,
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

type BrowserSpecificOptions = BrowserClientReplayOptions &
  BrowserClientProfilingOptions & {
    /** If configured, this URL will be used as base URL for lazy loading integration. */
    cdnBaseUrl?: string;

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

    /**
     * If you use Spotlight by Sentry during development, use
     * this option to forward captured Sentry events to Spotlight.
     *
     * Either set it to true, or provide a specific Spotlight Sidecar URL.
     *
     * More details: https://spotlightjs.com/
     *
     * IMPORTANT: Only set this option to `true` while developing, not in production!
     */
    spotlight?: boolean | string;
  };
/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/core Options for more information.
 */
export type BrowserOptions = CoreOptions<BrowserTransportOptions> & BrowserSpecificOptions;

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
  /**
   * Creates a new Browser SDK instance.
   *
   * @param options Configuration options for this SDK.
   */
  public constructor(options: BrowserClientOptions) {
    const opts = applyDefaultOptions(options);
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();
    applySdkMetadata(opts, 'browser', ['browser'], sdkSource);

    // Only allow IP inferral by Relay if sendDefaultPii is true
    if (opts._metadata?.sdk) {
      opts._metadata.sdk.settings = {
        infer_ip: opts.sendDefaultPii ? 'auto' : 'never',
        // purposefully allowing already passed settings to override the default
        ...opts._metadata.sdk.settings,
      };
    }

    super(opts);

    const {
      sendDefaultPii,
      sendClientReports,
      enableLogs,
      _experiments,
      enableMetrics: enableMetricsOption,
    } = this._options;

    // todo(v11): Remove the experimental flag
    // eslint-disable-next-line deprecation/deprecation
    const enableMetrics = enableMetricsOption ?? _experiments?.enableMetrics ?? true;

    // Flush logs and metrics when page becomes hidden (e.g., tab switch, navigation)
    // todo(v11): Remove the experimental flag
    if (WINDOW.document && (sendClientReports || enableLogs || enableMetrics)) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          if (sendClientReports) {
            this._flushOutcomes();
          }
          if (enableLogs) {
            _INTERNAL_flushLogsBuffer(this);
          }

          if (enableMetrics) {
            _INTERNAL_flushMetricsBuffer(this);
          }
        }
      });
    }

    if (sendDefaultPii) {
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
