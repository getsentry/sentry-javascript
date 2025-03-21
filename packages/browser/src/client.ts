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
  Client,
  addAutoIpAddressToSession,
  addAutoIpAddressToUser,
  applySdkMetadata,
  getSDKSource,
} from '@sentry/core';
import { eventFromException, eventFromMessage } from './eventbuilder';
import { WINDOW } from './helpers';
import type { BrowserTransportOptions } from './transports/types';

/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/core Options for more information.
 */
export type BrowserOptions = Options<BrowserTransportOptions> &
  BrowserClientReplayOptions &
  BrowserClientProfilingOptions & {
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
export type BrowserClientOptions = ClientOptions<BrowserTransportOptions> &
  BrowserClientReplayOptions &
  BrowserClientProfilingOptions & {
    /** If configured, this URL will be used as base URL for lazy loading integration. */
    cdnBaseUrl?: string;
  };

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
    const opts = {
      // We default this to true, as it is the safer scenario
      parentSpanIsAlwaysRootSpan: true,
      ...options,
    };
    const sdkSource = WINDOW.SENTRY_SDK_SOURCE || getSDKSource();
    applySdkMetadata(opts, 'browser', ['browser'], sdkSource);

    super(opts);

    if (opts.sendClientReports && WINDOW.document) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          this._flushOutcomes();
        }
      });
    }

    if (this._options.sendDefaultPii) {
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
