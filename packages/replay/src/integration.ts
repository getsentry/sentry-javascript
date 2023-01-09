import { getCurrentHub } from '@sentry/core';
import type { BrowserClientReplayOptions } from '@sentry/types';
import { Integration } from '@sentry/types';

import {
  DEFAULT_ERROR_SAMPLE_RATE,
  DEFAULT_FLUSH_MAX_DELAY,
  DEFAULT_FLUSH_MIN_DELAY,
  DEFAULT_SESSION_SAMPLE_RATE,
  INITIAL_FLUSH_DELAY,
  MASK_ALL_TEXT_SELECTOR,
} from './constants';
import { ReplayContainer } from './replay';
import type { RecordingOptions, ReplayConfiguration, ReplayPluginOptions } from './types';
import { isBrowser } from './util/isBrowser';

const MEDIA_SELECTORS = 'img,image,svg,path,rect,area,video,object,picture,embed,map,audio';

let _initialized = false;

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
  readonly recordingOptions: RecordingOptions;

  readonly options: ReplayPluginOptions;

  private _replay?: ReplayContainer;

  constructor({
    flushMinDelay = DEFAULT_FLUSH_MIN_DELAY,
    flushMaxDelay = DEFAULT_FLUSH_MAX_DELAY,
    initialFlushDelay = INITIAL_FLUSH_DELAY,
    stickySession = true,
    useCompression = true,
    sessionSampleRate,
    errorSampleRate,
    maskAllText,
    maskTextSelector,
    maskAllInputs = true,
    blockAllMedia = true,
    _experiments = {},
    blockClass = 'sentry-block',
    ignoreClass = 'sentry-ignore',
    maskTextClass = 'sentry-mask',
    blockSelector = '[data-sentry-block]',
    ...recordingOptions
  }: ReplayConfiguration = {}) {
    this.recordingOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      maskTextSelector,
      blockSelector,
      ...recordingOptions,
    };

    this.options = {
      flushMinDelay,
      flushMaxDelay,
      stickySession,
      initialFlushDelay,
      sessionSampleRate: DEFAULT_SESSION_SAMPLE_RATE,
      errorSampleRate: DEFAULT_ERROR_SAMPLE_RATE,
      useCompression,
      maskAllText: typeof maskAllText === 'boolean' ? maskAllText : !maskTextSelector,
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

      this.options.sessionSampleRate = sessionSampleRate;
    }

    if (typeof errorSampleRate === 'number') {
      // eslint-disable-next-line
      console.warn(
        `[Replay] You are passing \`errorSampleRate\` to the Replay integration.
This option is deprecated and will be removed soon.
Instead, configure \`replaysOnErrorSampleRate\` directly in the SDK init options, e.g.:
Sentry.init({ replaysOnErrorSampleRate: ${errorSampleRate} })`,
      );

      this.options.errorSampleRate = errorSampleRate;
    }

    if (this.options.maskAllText) {
      // `maskAllText` is a more user friendly option to configure
      // `maskTextSelector`. This means that all nodes will have their text
      // content masked.
      this.recordingOptions.maskTextSelector = MASK_ALL_TEXT_SELECTOR;
    }

    if (this.options.blockAllMedia) {
      // `blockAllMedia` is a more user friendly option to configure blocking
      // embedded media elements
      this.recordingOptions.blockSelector = !this.recordingOptions.blockSelector
        ? MEDIA_SELECTORS
        : `${this.recordingOptions.blockSelector},${MEDIA_SELECTORS}`;
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
  setupOnce(): void {
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
  start(): void {
    if (!this._replay) {
      return;
    }

    this._replay.start();
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  stop(): void {
    if (!this._replay) {
      return;
    }

    this._replay.stop();
  }

  /** Setup the integration. */
  private _setup(): void {
    // Client is not available in constructor, so we need to wait until setupOnce
    this._loadReplayOptionsFromClient();

    this._replay = new ReplayContainer({
      options: this.options,
      recordingOptions: this.recordingOptions,
    });
  }

  /** Parse Replay-related options from SDK options */
  private _loadReplayOptionsFromClient(): void {
    const client = getCurrentHub().getClient();
    const opt = client && (client.getOptions() as BrowserClientReplayOptions | undefined);

    if (opt && typeof opt.replaysSessionSampleRate === 'number') {
      this.options.sessionSampleRate = opt.replaysSessionSampleRate;
    }

    if (opt && typeof opt.replaysOnErrorSampleRate === 'number') {
      this.options.errorSampleRate = opt.replaysOnErrorSampleRate;
    }
  }
}
