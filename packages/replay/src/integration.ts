import { getCurrentHub } from '@sentry/core';
import type { BrowserClientReplayOptions, Integration } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { DEFAULT_FLUSH_MAX_DELAY, DEFAULT_FLUSH_MIN_DELAY } from './constants';
import { ReplayContainer } from './replay';
import type { RecordingOptions, ReplayConfiguration, ReplayPluginOptions } from './types';
import { getPrivacyOptions } from './util/getPrivacyOptions';
import { isBrowser } from './util/isBrowser';

const MEDIA_SELECTORS =
  'img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]';

let _initialized = false;

type InitialReplayPluginOptions = Omit<ReplayPluginOptions, 'sessionSampleRate' | 'errorSampleRate'> &
  Partial<Pick<ReplayPluginOptions, 'sessionSampleRate' | 'errorSampleRate'>>;

/**
 * The main replay integration class, to be passed to `init({  integrations: [] })`.
 */
export class Replay implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string = Replay.id;

  /**
   * Options to pass to `rrweb.record()`
   */
  private readonly _recordingOptions: RecordingOptions;

  /**
   * Initial options passed to the replay integration, merged with default values.
   * Note: `sessionSampleRate` and `errorSampleRate` are not required here, as they
   * can only be finally set when setupOnce() is called.
   *
   * @private
   */
  private readonly _initialOptions: InitialReplayPluginOptions;

  private _replay?: ReplayContainer;

  public constructor({
    flushMinDelay = DEFAULT_FLUSH_MIN_DELAY,
    flushMaxDelay = DEFAULT_FLUSH_MAX_DELAY,
    stickySession = true,
    useCompression = true,
    _experiments = {},
    sessionSampleRate,
    errorSampleRate,
    maskAllText = true,
    maskAllInputs = true,
    blockAllMedia = true,

    mask = [],
    unmask = [],
    block = [],
    unblock = [],
    ignore = [],
    maskFn,

    // eslint-disable-next-line deprecation/deprecation
    blockClass,
    // eslint-disable-next-line deprecation/deprecation
    blockSelector,
    // eslint-disable-next-line deprecation/deprecation
    maskInputOptions,
    // eslint-disable-next-line deprecation/deprecation
    maskTextClass,
    // eslint-disable-next-line deprecation/deprecation
    maskTextSelector,
    // eslint-disable-next-line deprecation/deprecation
    ignoreClass,
  }: ReplayConfiguration = {}) {
    this._recordingOptions = {
      maskAllInputs,
      maskAllText,
      maskInputOptions: { ...(maskInputOptions || {}), password: true },
      maskTextFn: maskFn,
      maskInputFn: maskFn,

      ...getPrivacyOptions({
        mask,
        unmask,
        block,
        unblock,
        ignore,
        blockClass,
        blockSelector,
        maskTextClass,
        maskTextSelector,
        ignoreClass,
      }),

      // Our defaults
      slimDOMOptions: 'all',
      inlineStylesheet: true,
      // Disable inline images as it will increase segment/replay size
      inlineImages: false,
      // collect fonts, but be aware that `sentry.io` needs to be an allowed
      // origin for playback
      collectFonts: true,
    };

    this._initialOptions = {
      flushMinDelay,
      flushMaxDelay,
      stickySession,
      sessionSampleRate,
      errorSampleRate,
      useCompression,
      blockAllMedia,
      _experiments,
    };

    if (typeof sessionSampleRate === 'number') {
      // eslint-disable-next-line
      console.warn(
        `[Replay] You are passing \`sessionSampleRate\` to the Replay integration.
This option is deprecated and will be removed soon.
Instead, configure \`replaysSessionSampleRate\` directly in the SDK init options, e.g.:
Sentry.init({ replaysSessionSampleRate: ${sessionSampleRate} })`,
      );

      this._initialOptions.sessionSampleRate = sessionSampleRate;
    }

    if (typeof errorSampleRate === 'number') {
      // eslint-disable-next-line
      console.warn(
        `[Replay] You are passing \`errorSampleRate\` to the Replay integration.
This option is deprecated and will be removed soon.
Instead, configure \`replaysOnErrorSampleRate\` directly in the SDK init options, e.g.:
Sentry.init({ replaysOnErrorSampleRate: ${errorSampleRate} })`,
      );

      this._initialOptions.errorSampleRate = errorSampleRate;
    }

    if (this._initialOptions.blockAllMedia) {
      // `blockAllMedia` is a more user friendly option to configure blocking
      // embedded media elements
      this._recordingOptions.blockSelector = !this._recordingOptions.blockSelector
        ? MEDIA_SELECTORS
        : `${this._recordingOptions.blockSelector},${MEDIA_SELECTORS}`;
    }

    if (this._isInitialized && isBrowser()) {
      throw new Error('Multiple Sentry Session Replay instances are not supported');
    }

    this._isInitialized = true;
  }

  /** If replay has already been initialized */
  protected get _isInitialized(): boolean {
    return _initialized;
  }

  /** Update _isInitialized */
  protected set _isInitialized(value: boolean) {
    _initialized = value;
  }

  /**
   * We previously used to create a transaction in `setupOnce` and it would
   * potentially create a transaction before some native SDK integrations have run
   * and applied their own global event processor. An example is:
   * https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
   *
   * So we call `replay.setup` in next event loop as a workaround to wait for other
   * global event processors to finish. This is no longer needed, but keeping it
   * here to avoid any future issues.
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    this._setup();

    // XXX: See method comments above
    setTimeout(() => this.start());
  }

  /**
   * Initializes the plugin.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM,
   * PerformanceObserver, Recording, Sentry SDK, etc)
   */
  public start(): void {
    if (!this._replay) {
      return;
    }

    this._replay.start();
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  public stop(): Promise<void> | void {
    if (!this._replay) {
      return;
    }

    return this._replay.stop();
  }

  /**
   * Immediately send all pending events.
   */
  public flush(): Promise<void> | void {
    if (!this._replay || !this._replay.isEnabled()) {
      return;
    }

    return this._replay.flushImmediate();
  }

  /** Setup the integration. */
  private _setup(): void {
    // Client is not available in constructor, so we need to wait until setupOnce
    const finalOptions = loadReplayOptionsFromClient(this._initialOptions);

    this._replay = new ReplayContainer({
      options: finalOptions,
      recordingOptions: this._recordingOptions,
    });
  }
}

/** Parse Replay-related options from SDK options */
function loadReplayOptionsFromClient(initialOptions: InitialReplayPluginOptions): ReplayPluginOptions {
  const client = getCurrentHub().getClient();
  const opt = client && (client.getOptions() as BrowserClientReplayOptions);

  const finalOptions = { sessionSampleRate: 0, errorSampleRate: 0, ...dropUndefinedKeys(initialOptions) };

  if (!opt) {
    // eslint-disable-next-line no-console
    console.warn('SDK client is not available.');
    return finalOptions;
  }

  if (
    initialOptions.sessionSampleRate == null && // TODO remove once deprecated rates are removed
    initialOptions.errorSampleRate == null && // TODO remove once deprecated rates are removed
    opt.replaysSessionSampleRate == null &&
    opt.replaysOnErrorSampleRate == null
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      'Replay is disabled because neither `replaysSessionSampleRate` nor `replaysOnErrorSampleRate` are set.',
    );
  }

  if (typeof opt.replaysSessionSampleRate === 'number') {
    finalOptions.sessionSampleRate = opt.replaysSessionSampleRate;
  }

  if (typeof opt.replaysOnErrorSampleRate === 'number') {
    finalOptions.errorSampleRate = opt.replaysOnErrorSampleRate;
  }

  return finalOptions;
}
