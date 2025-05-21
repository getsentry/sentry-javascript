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
  consoleSandbox,
  getLocationHref,
  getSDKSource,
} from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { eventFromException, eventFromMessage } from './eventbuilder';
import { WINDOW } from './helpers';
import type { BrowserTransportOptions } from './transports/types';

type ExtensionRuntime = {
  runtime?: {
    id?: string;
  };
};
type ExtensionProperties = {
  chrome?: ExtensionRuntime;
  browser?: ExtensionRuntime;
  nw?: unknown;
};

/**
 * A magic string that build tooling can leverage in order to inject a release value into the SDK.
 */
declare const __SENTRY_RELEASE__: string | undefined;

const DEFAULT_FLUSH_INTERVAL = 5000;

type BrowserSpecificOptions = BrowserClientReplayOptions &
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

    /** If configured, this URL will be used as base URL for lazy loading integration. */
    cdnBaseUrl?: string;
  };
/**
 * Configuration options for the Sentry Browser SDK.
 * @see @sentry/core Options for more information.
 */
export type BrowserOptions = Options<BrowserTransportOptions> & BrowserSpecificOptions;

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

    if (!opts.skipBrowserExtensionCheck && checkIfEmbeddedBrowserExtension()) {
      opts.enabled = false;
    }

    super(opts);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    const { sendDefaultPii, _experiments } = client._options;
    const enableLogs = _experiments?.enableLogs;

    if (opts.sendClientReports && WINDOW.document) {
      WINDOW.document.addEventListener('visibilitychange', () => {
        if (WINDOW.document.visibilityState === 'hidden') {
          this._flushOutcomes();
          if (enableLogs) {
            _INTERNAL_flushLogsBuffer(client);
          }
        }
      });
    }

    if (enableLogs) {
      client.on('flush', () => {
        _INTERNAL_flushLogsBuffer(client);
      });

      client.on('afterCaptureLog', () => {
        if (client._logFlushIdleTimeout) {
          clearTimeout(client._logFlushIdleTimeout);
        }

        client._logFlushIdleTimeout = setTimeout(() => {
          _INTERNAL_flushLogsBuffer(client);
        }, DEFAULT_FLUSH_INTERVAL);
      });
    }

    if (sendDefaultPii) {
      client.on('postprocessEvent', addAutoIpAddressToUser);
      client.on('beforeSendSession', addAutoIpAddressToSession);
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

/**
 * Returns true if the SDK is running in an embedded browser extension.
 * Stand-alone browser extensions (which do not share the same data as the main browser page) are fine.
 */
function checkIfEmbeddedBrowserExtension(): true | void {
  if (_isEmbeddedBrowserExtension()) {
    if (DEBUG_BUILD) {
      consoleSandbox(() => {
        // eslint-disable-next-line no-console
        console.error(
          '[Sentry] You cannot use Sentry.init() in a browser extension, see: https://docs.sentry.io/platforms/javascript/best-practices/browser-extensions/',
        );
      });
    }

    return true;
  }
}

function _isEmbeddedBrowserExtension(): boolean {
  if (typeof WINDOW.window === 'undefined') {
    // No need to show the error if we're not in a browser window environment (e.g. service workers)
    return false;
  }

  const _window = WINDOW as typeof WINDOW & ExtensionProperties;

  // Running the SDK in NW.js, which appears like a browser extension but isn't, is also fine
  // see: https://github.com/getsentry/sentry-javascript/issues/12668
  if (_window.nw) {
    return false;
  }

  const extensionObject = _window['chrome'] || _window['browser'];

  if (!extensionObject?.runtime?.id) {
    return false;
  }

  const href = getLocationHref();
  const extensionProtocols = ['chrome-extension', 'moz-extension', 'ms-browser-extension', 'safari-web-extension'];

  // Running the SDK in a dedicated extension page and calling Sentry.init is fine; no risk of data leakage
  const isDedicatedExtensionPage =
    WINDOW === WINDOW.top && extensionProtocols.some(protocol => href.startsWith(`${protocol}://`));

  return !isDedicatedExtensionPage;
}
