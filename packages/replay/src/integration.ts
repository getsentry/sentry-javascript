import { getCurrentHub } from '@sentry/core';
import type { BrowserClientReplayOptions, Integration } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import {
  DEFAULT_FLUSH_MAX_DELAY,
  DEFAULT_FLUSH_MIN_DELAY,
  MAX_REPLAY_DURATION,
  MIN_REPLAY_DURATION,
  MIN_REPLAY_DURATION_LIMIT,
} from './constants';
import { ReplayContainer } from './replay';
import type { RecordingOptions, ReplayConfiguration, ReplayPluginOptions, SendBufferedReplayOptions } from './types';
import { getPrivacyOptions } from './util/getPrivacyOptions';
import { isBrowser } from './util/isBrowser';

const MEDIA_SELECTORS =
  'img,image,svg,video,object,picture,embed,map,audio,link[rel="icon"],link[rel="apple-touch-icon"]';

const DEFAULT_NETWORK_HEADERS = ['content-length', 'content-type', 'accept'];

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
  public name: string;

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
    minReplayDuration = MIN_REPLAY_DURATION,
    maxReplayDuration = MAX_REPLAY_DURATION,
    stickySession = true,
    useCompression = true,
    _experiments = {},
    sessionSampleRate,
    errorSampleRate,
    maskAllText = true,
    maskAllInputs = true,
    blockAllMedia = true,

    mutationBreadcrumbLimit = 750,
    mutationLimit = 10_000,

    slowClickTimeout = 7_000,
    slowClickIgnoreSelectors = [],

    networkDetailAllowUrls = [],
    networkDetailDenyUrls = [],
    networkCaptureBodies = true,
    networkRequestHeaders = [],
    networkResponseHeaders = [],

    mask = [],
    unmask = [],
    block = [],
    unblock = [],
    ignore = [],
    maskFn,

    beforeAddRecordingEvent,

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
    this.name = Replay.id;

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
      minReplayDuration: Math.min(minReplayDuration, MIN_REPLAY_DURATION_LIMIT),
      maxReplayDuration: Math.min(maxReplayDuration, MAX_REPLAY_DURATION),
      stickySession,
      sessionSampleRate,
      errorSampleRate,
      useCompression,
      blockAllMedia,
      maskAllInputs,
      maskAllText,
      mutationBreadcrumbLimit,
      mutationLimit,
      slowClickTimeout,
      slowClickIgnoreSelectors,
      networkDetailAllowUrls,
      networkDetailDenyUrls,
      networkCaptureBodies,
      networkRequestHeaders: _getMergedNetworkHeaders(networkRequestHeaders),
      networkResponseHeaders: _getMergedNetworkHeaders(networkResponseHeaders),
      beforeAddRecordingEvent,

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
   * Setup and initialize replay container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    this._setup();

    // Once upon a time, we tried to create a transaction in `setupOnce` and it would
    // potentially create a transaction before some native SDK integrations have run
    // and applied their own global event processor. An example is:
    // https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
    //
    // So we call `this._initialize()` in next event loop as a workaround to wait for other
    // global event processors to finish. This is no longer needed, but keeping it
    // here to avoid any future issues.
    setTimeout(() => this._initialize());
  }

  /**
   * Start a replay regardless of sampling rate. Calling this will always
   * create a new session. Will throw an error if replay is already in progress.
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
   * Start replay buffering. Buffers until `flush()` is called or, if
   * `replaysOnErrorSampleRate` > 0, until an error occurs.
   */
  public startBuffering(): void {
    if (!this._replay) {
      return;
    }

    this._replay.startBuffering();
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  public stop(): Promise<void> {
    if (!this._replay) {
      return Promise.resolve();
    }

    return this._replay.stop({ forceFlush: this._replay.recordingMode === 'session' });
  }

  /**
   * If not in "session" recording mode, flush event buffer which will create a new replay.
   * Unless `continueRecording` is false, the replay will continue to record and
   * behave as a "session"-based replay.
   *
   * Otherwise, queue up a flush.
   */
  public flush(options?: SendBufferedReplayOptions): Promise<void> {
    if (!this._replay || !this._replay.isEnabled()) {
      return Promise.resolve();
    }

    return this._replay.sendBufferedReplayOrFlush(options);
  }

  /**
   * Get the current session ID.
   */
  public getReplayId(): string | undefined {
    if (!this._replay || !this._replay.isEnabled()) {
      return;
    }

    return this._replay.getSessionId();
  }
  /**
   * Initializes replay.
   */
  protected _initialize(): void {
    if (!this._replay) {
      return;
    }

    this._replay.initializeSampling();
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

function _getMergedNetworkHeaders(headers: string[]): string[] {
  return [...DEFAULT_NETWORK_HEADERS, ...headers.map(header => header.toLowerCase())];
}
