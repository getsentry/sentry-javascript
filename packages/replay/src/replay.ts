/* eslint-disable max-lines */ // TODO: We might want to split this file up
import { EventType, record } from '@sentry-internal/rrweb';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  captureException,
  getActiveSpan,
  getClient,
  getRootSpan,
  spanToJSON,
} from '@sentry/core';
import type { ReplayRecordingMode, Span } from '@sentry/types';
import { logger } from '@sentry/utils';

import {
  BUFFER_CHECKOUT_TIME,
  SESSION_IDLE_EXPIRE_DURATION,
  SESSION_IDLE_PAUSE_DURATION,
  SLOW_CLICK_SCROLL_TIMEOUT,
  SLOW_CLICK_THRESHOLD,
  WINDOW,
} from './constants';
import { ClickDetector } from './coreHandlers/handleClick';
import { handleKeyboardEvent } from './coreHandlers/handleKeyboardEvent';
import { setupPerformanceObserver } from './coreHandlers/performanceObserver';
import { DEBUG_BUILD } from './debug-build';
import { createEventBuffer } from './eventBuffer';
import { clearSession } from './session/clearSession';
import { loadOrCreateSession } from './session/loadOrCreateSession';
import { saveSession } from './session/saveSession';
import { shouldRefreshSession } from './session/shouldRefreshSession';
import type {
  AddEventResult,
  AddUpdateCallback,
  AllPerformanceEntry,
  AllPerformanceEntryData,
  EventBuffer,
  InternalEventContext,
  PopEventContext,
  RecordingEvent,
  RecordingOptions,
  ReplayBreadcrumbFrame,
  ReplayCanvasIntegrationOptions,
  ReplayContainer as ReplayContainerInterface,
  ReplayPerformanceEntry,
  ReplayPluginOptions,
  SendBufferedReplayOptions,
  Session,
  SlowClickConfig,
  Timeouts,
} from './types';
import { ReplayEventTypeCustom } from './types';
import { addEvent, addEventSync } from './util/addEvent';
import { addGlobalListeners } from './util/addGlobalListeners';
import { addMemoryEntry } from './util/addMemoryEntry';
import { createBreadcrumb } from './util/createBreadcrumb';
import { createPerformanceEntries } from './util/createPerformanceEntries';
import { createPerformanceSpans } from './util/createPerformanceSpans';
import { debounce } from './util/debounce';
import { getHandleRecordingEmit } from './util/handleRecordingEmit';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logInfo, logInfoNextTick } from './util/log';
import { sendReplay } from './util/sendReplay';
import type { SKIPPED } from './util/throttle';
import { THROTTLED, throttle } from './util/throttle';

/**
 * The main replay container class, which holds all the state and methods for recording and sending replays.
 */
export class ReplayContainer implements ReplayContainerInterface {
  public eventBuffer: EventBuffer | null;

  public performanceEntries: AllPerformanceEntry[];

  public replayPerformanceEntries: ReplayPerformanceEntry<AllPerformanceEntryData>[];

  public session: Session | undefined;

  public clickDetector: ClickDetector | undefined;

  /**
   * Recording can happen in one of three modes:
   *   - session: Record the whole session, sending it continuously
   *   - buffer: Always keep the last 60s of recording, requires:
   *     - having replaysOnErrorSampleRate > 0 to capture replay when an error occurs
   *     - or calling `flush()` to send the replay
   */
  public recordingMode: ReplayRecordingMode;

  /**
   * The current or last active span.
   * This is only available when performance is enabled.
   */
  public lastActiveSpan?: Span;

  /**
   * These are here so we can overwrite them in tests etc.
   * @hidden
   */
  public readonly timeouts: Timeouts;

  private _throttledAddEvent: (
    event: RecordingEvent,
    isCheckout?: boolean,
  ) => typeof THROTTLED | typeof SKIPPED | Promise<AddEventResult | null>;

  /**
   * Options to pass to `rrweb.record()`
   */
  private readonly _recordingOptions: RecordingOptions;

  private readonly _options: ReplayPluginOptions;

  private _performanceCleanupCallback?: () => void;

  private _debouncedFlush: ReturnType<typeof debounce>;
  private _flushLock: Promise<unknown> | undefined;

  /**
   * Timestamp of the last user activity. This lives across sessions.
   */
  private _lastActivity: number;

  /**
   * Is the integration currently active?
   */
  private _isEnabled: boolean;

  /**
   * Paused is a state where:
   * - DOM Recording is not listening at all
   * - Nothing will be added to event buffer (e.g. core SDK events)
   */
  private _isPaused: boolean;

  /**
   * Have we attached listeners to the core SDK?
   * Note we have to track this as there is no way to remove instrumentation handlers.
   */
  private _hasInitializedCoreListeners: boolean;

  /**
   * Function to stop recording
   */
  private _stopRecording: ReturnType<typeof record> | undefined;

  private _context: InternalEventContext;

  /**
   * Internal use for canvas recording options
   */
  private _canvas: ReplayCanvasIntegrationOptions | undefined;

  public constructor({
    options,
    recordingOptions,
  }: {
    options: ReplayPluginOptions;
    recordingOptions: RecordingOptions;
  }) {
    this.eventBuffer = null;
    this.performanceEntries = [];
    this.replayPerformanceEntries = [];
    this.recordingMode = 'session';
    this.timeouts = {
      sessionIdlePause: SESSION_IDLE_PAUSE_DURATION,
      sessionIdleExpire: SESSION_IDLE_EXPIRE_DURATION,
    } as const;
    this._lastActivity = Date.now();
    this._isEnabled = false;
    this._isPaused = false;
    this._hasInitializedCoreListeners = false;
    this._context = {
      errorIds: new Set(),
      traceIds: new Set(),
      urls: [],
      initialTimestamp: Date.now(),
      initialUrl: '',
    };

    this._recordingOptions = recordingOptions;
    this._options = options;

    this._debouncedFlush = debounce(() => this._flush(), this._options.flushMinDelay, {
      maxWait: this._options.flushMaxDelay,
    });

    this._throttledAddEvent = throttle(
      (event: RecordingEvent, isCheckout?: boolean) => addEvent(this, event, isCheckout),
      // Max 300 events...
      300,
      // ... per 5s
      5,
    );

    const { slowClickTimeout, slowClickIgnoreSelectors } = this.getOptions();

    const slowClickConfig: SlowClickConfig | undefined = slowClickTimeout
      ? {
          threshold: Math.min(SLOW_CLICK_THRESHOLD, slowClickTimeout),
          timeout: slowClickTimeout,
          scrollTimeout: SLOW_CLICK_SCROLL_TIMEOUT,
          ignoreSelector: slowClickIgnoreSelectors ? slowClickIgnoreSelectors.join(',') : '',
        }
      : undefined;

    if (slowClickConfig) {
      this.clickDetector = new ClickDetector(this, slowClickConfig);
    }
  }

  /** Get the event context. */
  public getContext(): InternalEventContext {
    return this._context;
  }

  /** If recording is currently enabled. */
  public isEnabled(): boolean {
    return this._isEnabled;
  }

  /** If recording is currently paused. */
  public isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * Determine if canvas recording is enabled
   */
  public isRecordingCanvas(): boolean {
    return Boolean(this._canvas);
  }

  /** Get the replay integration options. */
  public getOptions(): ReplayPluginOptions {
    return this._options;
  }

  /**
   * Initializes the plugin based on sampling configuration. Should not be
   * called outside of constructor.
   */
  public initializeSampling(previousSessionId?: string): void {
    const { errorSampleRate, sessionSampleRate } = this._options;

    // If neither sample rate is > 0, then do nothing - user will need to call one of
    // `start()` or `startBuffering` themselves.
    if (errorSampleRate <= 0 && sessionSampleRate <= 0) {
      return;
    }

    // Otherwise if there is _any_ sample rate set, try to load an existing
    // session, or create a new one.
    this._initializeSessionForSampling(previousSessionId);

    if (!this.session) {
      // This should not happen, something wrong has occurred
      this._handleException(new Error('Unable to initialize and create session'));
      return;
    }

    if (this.session.sampled === false) {
      // This should only occur if `errorSampleRate` is 0 and was unsampled for
      // session-based replay. In this case there is nothing to do.
      return;
    }

    // If segmentId > 0, it means we've previously already captured this session
    // In this case, we still want to continue in `session` recording mode
    this.recordingMode = this.session.sampled === 'buffer' && this.session.segmentId === 0 ? 'buffer' : 'session';

    logInfoNextTick(
      `[Replay] Starting replay in ${this.recordingMode} mode`,
      this._options._experiments.traceInternals,
    );

    this._initializeRecording();
  }

  /**
   * Start a replay regardless of sampling rate. Calling this will always
   * create a new session. Will throw an error if replay is already in progress.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM,
   * _performanceObserver, Recording, Sentry SDK, etc)
   */
  public start(): void {
    if (this._isEnabled && this.recordingMode === 'session') {
      throw new Error('Replay recording is already in progress');
    }

    if (this._isEnabled && this.recordingMode === 'buffer') {
      throw new Error('Replay buffering is in progress, call `flush()` to save the replay');
    }

    logInfoNextTick('[Replay] Starting replay in session mode', this._options._experiments.traceInternals);

    const session = loadOrCreateSession(
      {
        maxReplayDuration: this._options.maxReplayDuration,
        sessionIdleExpire: this.timeouts.sessionIdleExpire,
        traceInternals: this._options._experiments.traceInternals,
      },
      {
        stickySession: this._options.stickySession,
        // This is intentional: create a new session-based replay when calling `start()`
        sessionSampleRate: 1,
        allowBuffering: false,
      },
    );

    this.session = session;

    this._initializeRecording();
  }

  /**
   * Start replay buffering. Buffers until `flush()` is called or, if
   * `replaysOnErrorSampleRate` > 0, an error occurs.
   */
  public startBuffering(): void {
    if (this._isEnabled) {
      throw new Error('Replay recording is already in progress');
    }

    logInfoNextTick('[Replay] Starting replay in buffer mode', this._options._experiments.traceInternals);

    const session = loadOrCreateSession(
      {
        sessionIdleExpire: this.timeouts.sessionIdleExpire,
        maxReplayDuration: this._options.maxReplayDuration,
        traceInternals: this._options._experiments.traceInternals,
      },
      {
        stickySession: this._options.stickySession,
        sessionSampleRate: 0,
        allowBuffering: true,
      },
    );

    this.session = session;

    this.recordingMode = 'buffer';
    this._initializeRecording();
  }

  /**
   * Start recording.
   *
   * Note that this will cause a new DOM checkout
   */
  public startRecording(): void {
    try {
      const canvasOptions = this._canvas;

      this._stopRecording = record({
        ...this._recordingOptions,
        // When running in error sampling mode, we need to overwrite `checkoutEveryNms`
        // Without this, it would record forever, until an error happens, which we don't want
        // instead, we'll always keep the last 60 seconds of replay before an error happened
        ...(this.recordingMode === 'buffer' && { checkoutEveryNms: BUFFER_CHECKOUT_TIME }),
        emit: getHandleRecordingEmit(this),
        onMutation: this._onMutationHandler,
        ...(canvasOptions
          ? {
              recordCanvas: canvasOptions.recordCanvas,
              getCanvasManager: canvasOptions.getCanvasManager,
              sampling: canvasOptions.sampling,
              dataURLOptions: canvasOptions.dataURLOptions,
            }
          : {}),
      });
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Stops the recording, if it was running.
   *
   * Returns true if it was previously stopped, or is now stopped,
   * otherwise false.
   */
  public stopRecording(): boolean {
    try {
      if (this._stopRecording) {
        this._stopRecording();
        this._stopRecording = undefined;
      }

      return true;
    } catch (err) {
      this._handleException(err);
      return false;
    }
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  public async stop({ forceFlush = false, reason }: { forceFlush?: boolean; reason?: string } = {}): Promise<void> {
    if (!this._isEnabled) {
      return;
    }

    // We can't move `_isEnabled` after awaiting a flush, otherwise we can
    // enter into an infinite loop when `stop()` is called while flushing.
    this._isEnabled = false;

    try {
      logInfo(
        `[Replay] Stopping Replay${reason ? ` triggered by ${reason}` : ''}`,
        this._options._experiments.traceInternals,
      );

      this._removeListeners();
      this.stopRecording();

      this._debouncedFlush.cancel();
      // See comment above re: `_isEnabled`, we "force" a flush, ignoring the
      // `_isEnabled` state of the plugin since it was disabled above.
      if (forceFlush) {
        await this._flush({ force: true });
      }

      // After flush, destroy event buffer
      this.eventBuffer && this.eventBuffer.destroy();
      this.eventBuffer = null;

      // Clear session from session storage, note this means if a new session
      // is started after, it will not have `previousSessionId`
      clearSession(this);
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Pause some replay functionality. See comments for `_isPaused`.
   * This differs from stop as this only stops DOM recording, it is
   * not as thorough of a shutdown as `stop()`.
   */
  public pause(): void {
    if (this._isPaused) {
      return;
    }

    this._isPaused = true;
    this.stopRecording();

    logInfo('[Replay] Pausing replay', this._options._experiments.traceInternals);
  }

  /**
   * Resumes recording, see notes for `pause().
   *
   * Note that calling `startRecording()` here will cause a
   * new DOM checkout.`
   */
  public resume(): void {
    if (!this._isPaused || !this._checkSession()) {
      return;
    }

    this._isPaused = false;
    this.startRecording();

    logInfo('[Replay] Resuming replay', this._options._experiments.traceInternals);
  }

  /**
   * If not in "session" recording mode, flush event buffer which will create a new replay.
   * Unless `continueRecording` is false, the replay will continue to record and
   * behave as a "session"-based replay.
   *
   * Otherwise, queue up a flush.
   */
  public async sendBufferedReplayOrFlush({ continueRecording = true }: SendBufferedReplayOptions = {}): Promise<void> {
    if (this.recordingMode === 'session') {
      return this.flushImmediate();
    }

    const activityTime = Date.now();

    logInfo('[Replay] Converting buffer to session', this._options._experiments.traceInternals);

    // Allow flush to complete before resuming as a session recording, otherwise
    // the checkout from `startRecording` may be included in the payload.
    // Prefer to keep the error replay as a separate (and smaller) segment
    // than the session replay.
    await this.flushImmediate();

    const hasStoppedRecording = this.stopRecording();

    if (!continueRecording || !hasStoppedRecording) {
      return;
    }

    // To avoid race conditions where this is called multiple times, we check here again that we are still buffering
    if ((this.recordingMode as ReplayRecordingMode) === 'session') {
      return;
    }

    // Re-start recording in session-mode
    this.recordingMode = 'session';

    // Once this session ends, we do not want to refresh it
    if (this.session) {
      this._updateUserActivity(activityTime);
      this._updateSessionActivity(activityTime);
      this._maybeSaveSession();
    }

    this.startRecording();
  }

  /**
   * We want to batch uploads of replay events. Save events only if
   * `<flushMinDelay>` milliseconds have elapsed since the last event
   * *OR* if `<flushMaxDelay>` milliseconds have elapsed.
   *
   * Accepts a callback to perform side-effects and returns true to stop batch
   * processing and hand back control to caller.
   */
  public addUpdate(cb: AddUpdateCallback): void {
    // We need to always run `cb` (e.g. in the case of `this.recordingMode == 'buffer'`)
    const cbResult = cb();

    // If this option is turned on then we will only want to call `flush`
    // explicitly
    if (this.recordingMode === 'buffer') {
      return;
    }

    // If callback is true, we do not want to continue with flushing -- the
    // caller will need to handle it.
    if (cbResult === true) {
      return;
    }

    // addUpdate is called quite frequently - use _debouncedFlush so that it
    // respects the flush delays and does not flush immediately
    this._debouncedFlush();
  }

  /**
   * Updates the user activity timestamp and resumes recording. This should be
   * called in an event handler for a user action that we consider as the user
   * being "active" (e.g. a mouse click).
   */
  public triggerUserActivity(): void {
    this._updateUserActivity();

    // This case means that recording was once stopped due to inactivity.
    // Ensure that recording is resumed.
    if (!this._stopRecording) {
      // Create a new session, otherwise when the user action is flushed, it
      // will get rejected due to an expired session.
      if (!this._checkSession()) {
        return;
      }

      // Note: This will cause a new DOM checkout
      this.resume();
      return;
    }

    // Otherwise... recording was never suspended, continue as normalish
    this.checkAndHandleExpiredSession();

    this._updateSessionActivity();
  }

  /**
   * Updates the user activity timestamp *without* resuming
   * recording. Some user events (e.g. keydown) can be create
   * low-value replays that only contain the keypress as a
   * breadcrumb. Instead this would require other events to
   * create a new replay after a session has expired.
   */
  public updateUserActivity(): void {
    this._updateUserActivity();
    this._updateSessionActivity();
  }

  /**
   * Only flush if `this.recordingMode === 'session'`
   */
  public conditionalFlush(): Promise<void> {
    if (this.recordingMode === 'buffer') {
      return Promise.resolve();
    }

    return this.flushImmediate();
  }

  /**
   * Flush using debounce flush
   */
  public flush(): Promise<void> {
    return this._debouncedFlush() as Promise<void>;
  }

  /**
   * Always flush via `_debouncedFlush` so that we do not have flushes triggered
   * from calling both `flush` and `_debouncedFlush`. Otherwise, there could be
   * cases of mulitple flushes happening closely together.
   */
  public flushImmediate(): Promise<void> {
    this._debouncedFlush();
    // `.flush` is provided by the debounced function, analogously to lodash.debounce
    return this._debouncedFlush.flush() as Promise<void>;
  }

  /**
   * Cancels queued up flushes.
   */
  public cancelFlush(): void {
    this._debouncedFlush.cancel();
  }

  /** Get the current sesion (=replay) ID */
  public getSessionId(): string | undefined {
    return this.session && this.session.id;
  }

  /**
   * Checks if recording should be stopped due to user inactivity. Otherwise
   * check if session is expired and create a new session if so. Triggers a new
   * full snapshot on new session.
   *
   * Returns true if session is not expired, false otherwise.
   * @hidden
   */
  public checkAndHandleExpiredSession(): boolean | void {
    // Prevent starting a new session if the last user activity is older than
    // SESSION_IDLE_PAUSE_DURATION. Otherwise non-user activity can trigger a new
    // session+recording. This creates noisy replays that do not have much
    // content in them.
    if (
      this._lastActivity &&
      isExpired(this._lastActivity, this.timeouts.sessionIdlePause) &&
      this.session &&
      this.session.sampled === 'session'
    ) {
      // Pause recording only for session-based replays. Otherwise, resuming
      // will create a new replay and will conflict with users who only choose
      // to record error-based replays only. (e.g. the resumed replay will not
      // contain a reference to an error)
      this.pause();
      return;
    }

    // --- There is recent user activity --- //
    // This will create a new session if expired, based on expiry length
    if (!this._checkSession()) {
      // Check session handles the refreshing itself
      return false;
    }

    return true;
  }

  /**
   * Capture some initial state that can change throughout the lifespan of the
   * replay. This is required because otherwise they would be captured at the
   * first flush.
   */
  public setInitialState(): void {
    const urlPath = `${WINDOW.location.pathname}${WINDOW.location.hash}${WINDOW.location.search}`;
    const url = `${WINDOW.location.origin}${urlPath}`;

    this.performanceEntries = [];
    this.replayPerformanceEntries = [];

    // Reset _context as well
    this._clearContext();

    this._context.initialUrl = url;
    this._context.initialTimestamp = Date.now();
    this._context.urls.push(url);
  }

  /**
   * Add a breadcrumb event, that may be throttled.
   * If it was throttled, we add a custom breadcrumb to indicate that.
   */
  public throttledAddEvent(
    event: RecordingEvent,
    isCheckout?: boolean,
  ): typeof THROTTLED | typeof SKIPPED | Promise<AddEventResult | null> {
    const res = this._throttledAddEvent(event, isCheckout);

    // If this is THROTTLED, it means we have throttled the event for the first time
    // In this case, we want to add a breadcrumb indicating that something was skipped
    if (res === THROTTLED) {
      const breadcrumb = createBreadcrumb({
        category: 'replay.throttled',
      });

      this.addUpdate(() => {
        // Return `false` if the event _was_ added, as that means we schedule a flush
        return !addEventSync(this, {
          type: ReplayEventTypeCustom,
          timestamp: breadcrumb.timestamp || 0,
          data: {
            tag: 'breadcrumb',
            payload: breadcrumb,
            metric: true,
          },
        });
      });
    }

    return res;
  }

  /**
   * This will get the parametrized route name of the current page.
   * This is only available if performance is enabled, and if an instrumented router is used.
   */
  public getCurrentRoute(): string | undefined {
    const lastActiveSpan = this.lastActiveSpan || getActiveSpan();
    const lastRootSpan = lastActiveSpan && getRootSpan(lastActiveSpan);

    const attributes = (lastRootSpan && spanToJSON(lastRootSpan).data) || {};
    const source = attributes[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];
    if (!lastRootSpan || !source || !['route', 'custom'].includes(source)) {
      return undefined;
    }

    return spanToJSON(lastRootSpan).description;
  }

  /**
   * Initialize and start all listeners to varying events (DOM,
   * Performance Observer, Recording, Sentry SDK, etc)
   */
  private _initializeRecording(): void {
    this.setInitialState();

    // this method is generally called on page load or manually - in both cases
    // we should treat it as an activity
    this._updateSessionActivity();

    this.eventBuffer = createEventBuffer({
      useCompression: this._options.useCompression,
      workerUrl: this._options.workerUrl,
    });

    this._removeListeners();
    this._addListeners();

    // Need to set as enabled before we start recording, as `record()` can trigger a flush with a new checkout
    this._isEnabled = true;
    this._isPaused = false;

    this.startRecording();
  }

  /** A wrapper to conditionally capture exceptions. */
  private _handleException(error: unknown): void {
    DEBUG_BUILD && logger.error('[Replay]', error);

    if (DEBUG_BUILD && this._options._experiments && this._options._experiments.captureExceptions) {
      captureException(error);
    }
  }

  /**
   * Loads (or refreshes) the current session.
   */
  private _initializeSessionForSampling(previousSessionId?: string): void {
    // Whenever there is _any_ error sample rate, we always allow buffering
    // Because we decide on sampling when an error occurs, we need to buffer at all times if sampling for errors
    const allowBuffering = this._options.errorSampleRate > 0;

    const session = loadOrCreateSession(
      {
        sessionIdleExpire: this.timeouts.sessionIdleExpire,
        maxReplayDuration: this._options.maxReplayDuration,
        traceInternals: this._options._experiments.traceInternals,
        previousSessionId,
      },
      {
        stickySession: this._options.stickySession,
        sessionSampleRate: this._options.sessionSampleRate,
        allowBuffering,
      },
    );

    this.session = session;
  }

  /**
   * Checks and potentially refreshes the current session.
   * Returns false if session is not recorded.
   */
  private _checkSession(): boolean {
    // If there is no session yet, we do not want to refresh anything
    // This should generally not happen, but to be safe....
    if (!this.session) {
      return false;
    }

    const currentSession = this.session;

    if (
      shouldRefreshSession(currentSession, {
        sessionIdleExpire: this.timeouts.sessionIdleExpire,
        maxReplayDuration: this._options.maxReplayDuration,
      })
    ) {
      // This should never reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this._refreshSession(currentSession);
      return false;
    }

    return true;
  }

  /**
   * Refresh a session with a new one.
   * This stops the current session (without forcing a flush, as that would never work since we are expired),
   * and then does a new sampling based on the refreshed session.
   */
  private async _refreshSession(session: Session): Promise<void> {
    if (!this._isEnabled) {
      return;
    }
    await this.stop({ reason: 'refresh session' });
    this.initializeSampling(session.id);
  }

  /**
   * Adds listeners to record events for the replay
   */
  private _addListeners(): void {
    try {
      WINDOW.document.addEventListener('visibilitychange', this._handleVisibilityChange);
      WINDOW.addEventListener('blur', this._handleWindowBlur);
      WINDOW.addEventListener('focus', this._handleWindowFocus);
      WINDOW.addEventListener('keydown', this._handleKeyboardEvent);

      if (this.clickDetector) {
        this.clickDetector.addListeners();
      }

      // There is no way to remove these listeners, so ensure they are only added once
      if (!this._hasInitializedCoreListeners) {
        addGlobalListeners(this);

        this._hasInitializedCoreListeners = true;
      }
    } catch (err) {
      this._handleException(err);
    }

    this._performanceCleanupCallback = setupPerformanceObserver(this);
  }

  /**
   * Cleans up listeners that were created in `_addListeners`
   */
  private _removeListeners(): void {
    try {
      WINDOW.document.removeEventListener('visibilitychange', this._handleVisibilityChange);

      WINDOW.removeEventListener('blur', this._handleWindowBlur);
      WINDOW.removeEventListener('focus', this._handleWindowFocus);
      WINDOW.removeEventListener('keydown', this._handleKeyboardEvent);

      if (this.clickDetector) {
        this.clickDetector.removeListeners();
      }

      if (this._performanceCleanupCallback) {
        this._performanceCleanupCallback();
      }
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Handle when visibility of the page content changes. Opening a new tab will
   * cause the state to change to hidden because of content of current page will
   * be hidden. Likewise, moving a different window to cover the contents of the
   * page will also trigger a change to a hidden state.
   */
  private _handleVisibilityChange: () => void = () => {
    if (WINDOW.document.visibilityState === 'visible') {
      this._doChangeToForegroundTasks();
    } else {
      this._doChangeToBackgroundTasks();
    }
  };

  /**
   * Handle when page is blurred
   */
  private _handleWindowBlur: () => void = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.blur',
    });

    // Do not count blur as a user action -- it's part of the process of them
    // leaving the page
    this._doChangeToBackgroundTasks(breadcrumb);
  };

  /**
   * Handle when page is focused
   */
  private _handleWindowFocus: () => void = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.focus',
    });

    // Do not count focus as a user action -- instead wait until they focus and
    // interactive with page
    this._doChangeToForegroundTasks(breadcrumb);
  };

  /** Ensure page remains active when a key is pressed. */
  private _handleKeyboardEvent: (event: KeyboardEvent) => void = (event: KeyboardEvent) => {
    handleKeyboardEvent(this, event);
  };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  private _doChangeToBackgroundTasks(breadcrumb?: ReplayBreadcrumbFrame): void {
    if (!this.session) {
      return;
    }

    const expired = isSessionExpired(this.session, {
      maxReplayDuration: this._options.maxReplayDuration,
      sessionIdleExpire: this.timeouts.sessionIdleExpire,
    });

    if (expired) {
      return;
    }

    if (breadcrumb) {
      this._createCustomBreadcrumb(breadcrumb);
    }

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    // This should never reject
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    void this.conditionalFlush();
  }

  /**
   * Tasks to run when we consider a page to be visible (via focus and/or visibility)
   */
  private _doChangeToForegroundTasks(breadcrumb?: ReplayBreadcrumbFrame): void {
    if (!this.session) {
      return;
    }

    const isSessionActive = this.checkAndHandleExpiredSession();

    if (!isSessionActive) {
      // If the user has come back to the page within SESSION_IDLE_PAUSE_DURATION
      // ms, we will re-use the existing session, otherwise create a new
      // session
      logInfo('[Replay] Document has become active, but session has expired');
      return;
    }

    if (breadcrumb) {
      this._createCustomBreadcrumb(breadcrumb);
    }
  }

  /**
   * Update user activity (across session lifespans)
   */
  private _updateUserActivity(_lastActivity: number = Date.now()): void {
    this._lastActivity = _lastActivity;
  }

  /**
   * Updates the session's last activity timestamp
   */
  private _updateSessionActivity(_lastActivity: number = Date.now()): void {
    if (this.session) {
      this.session.lastActivity = _lastActivity;
      this._maybeSaveSession();
    }
  }

  /**
   * Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
   */
  private _createCustomBreadcrumb(breadcrumb: ReplayBreadcrumbFrame): void {
    this.addUpdate(() => {
      // This should never reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.throttledAddEvent({
        type: EventType.Custom,
        timestamp: breadcrumb.timestamp || 0,
        data: {
          tag: 'breadcrumb',
          payload: breadcrumb,
        },
      });
    });
  }

  /**
   * Observed performance events are added to `this.performanceEntries`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  private _addPerformanceEntries(): Promise<Array<AddEventResult | null>> {
    const performanceEntries = createPerformanceEntries(this.performanceEntries).concat(this.replayPerformanceEntries);

    this.performanceEntries = [];
    this.replayPerformanceEntries = [];

    return Promise.all(createPerformanceSpans(this, performanceEntries));
  }

  /**
   * Clear _context
   */
  private _clearContext(): void {
    // XXX: `initialTimestamp` and `initialUrl` do not get cleared
    this._context.errorIds.clear();
    this._context.traceIds.clear();
    this._context.urls = [];
  }

  /** Update the initial timestamp based on the buffer content. */
  private _updateInitialTimestampFromEventBuffer(): void {
    const { session, eventBuffer } = this;
    if (!session || !eventBuffer) {
      return;
    }

    // we only ever update this on the initial segment
    if (session.segmentId) {
      return;
    }

    const earliestEvent = eventBuffer.getEarliestTimestamp();
    if (earliestEvent && earliestEvent < this._context.initialTimestamp) {
      this._context.initialTimestamp = earliestEvent;
    }
  }

  /**
   * Return and clear _context
   */
  private _popEventContext(): PopEventContext {
    const _context = {
      initialTimestamp: this._context.initialTimestamp,
      initialUrl: this._context.initialUrl,
      errorIds: Array.from(this._context.errorIds),
      traceIds: Array.from(this._context.traceIds),
      urls: this._context.urls,
    };

    this._clearContext();

    return _context;
  }

  /**
   * Flushes replay event buffer to Sentry.
   *
   * Performance events are only added right before flushing - this is
   * due to the buffered performance observer events.
   *
   * Should never be called directly, only by `flush`
   */
  private async _runFlush(): Promise<void> {
    const replayId = this.getSessionId();

    if (!this.session || !this.eventBuffer || !replayId) {
      DEBUG_BUILD && logger.error('[Replay] No session or eventBuffer found to flush.');
      return;
    }

    await this._addPerformanceEntries();

    // Check eventBuffer again, as it could have been stopped in the meanwhile
    if (!this.eventBuffer || !this.eventBuffer.hasEvents) {
      return;
    }

    // Only attach memory event if eventBuffer is not empty
    await addMemoryEntry(this);

    // Check eventBuffer again, as it could have been stopped in the meanwhile
    if (!this.eventBuffer) {
      return;
    }

    // if this changed in the meanwhile, e.g. because the session was refreshed or similar, we abort here
    if (replayId !== this.getSessionId()) {
      return;
    }

    try {
      // This uses the data from the eventBuffer, so we need to call this before `finish()
      this._updateInitialTimestampFromEventBuffer();

      const timestamp = Date.now();

      // Check total duration again, to avoid sending outdated stuff
      // We leave 30s wiggle room to accomodate late flushing etc.
      // This _could_ happen when the browser is suspended during flushing, in which case we just want to stop
      if (timestamp - this._context.initialTimestamp > this._options.maxReplayDuration + 30_000) {
        throw new Error('Session is too long, not sending replay');
      }

      const eventContext = this._popEventContext();
      // Always increment segmentId regardless of outcome of sending replay
      const segmentId = this.session.segmentId++;
      this._maybeSaveSession();

      // Note this empties the event buffer regardless of outcome of sending replay
      const recordingData = await this.eventBuffer.finish();

      await sendReplay({
        replayId,
        recordingData,
        segmentId,
        eventContext,
        session: this.session,
        options: this.getOptions(),
        timestamp,
      });
    } catch (err) {
      this._handleException(err);

      // This means we retried 3 times and all of them failed,
      // or we ran into a problem we don't want to retry, like rate limiting.
      // In this case, we want to completely stop the replay - otherwise, we may get inconsistent segments
      // This should never reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.stop({ reason: 'sendReplay' });

      const client = getClient();

      if (client) {
        client.recordDroppedEvent('send_error', 'replay');
      }
    }
  }

  /**
   * Flush recording data to Sentry. Creates a lock so that only a single flush
   * can be active at a time. Do not call this directly.
   */
  private _flush = async ({
    force = false,
  }: {
    /**
     * If true, flush while ignoring the `_isEnabled` state of
     * Replay integration. (By default, flush is noop if integration
     * is stopped).
     */
    force?: boolean;
  } = {}): Promise<void> => {
    if (!this._isEnabled && !force) {
      // This can happen if e.g. the replay was stopped because of exceeding the retry limit
      return;
    }

    if (!this.checkAndHandleExpiredSession()) {
      DEBUG_BUILD && logger.error('[Replay] Attempting to finish replay event after session expired.');
      return;
    }

    if (!this.session) {
      // should never happen, as we would have bailed out before
      return;
    }

    const start = this.session.started;
    const now = Date.now();
    const duration = now - start;

    // A flush is about to happen, cancel any queued flushes
    this._debouncedFlush.cancel();

    // If session is too short, or too long (allow some wiggle room over maxReplayDuration), do not send it
    // This _should_ not happen, but it may happen if flush is triggered due to a page activity change or similar
    const tooShort = duration < this._options.minReplayDuration;
    const tooLong = duration > this._options.maxReplayDuration + 5_000;
    if (tooShort || tooLong) {
      logInfo(
        `[Replay] Session duration (${Math.floor(duration / 1000)}s) is too ${
          tooShort ? 'short' : 'long'
        }, not sending replay.`,
        this._options._experiments.traceInternals,
      );

      if (tooShort) {
        this._debouncedFlush();
      }
      return;
    }

    const eventBuffer = this.eventBuffer;
    if (eventBuffer && this.session.segmentId === 0 && !eventBuffer.hasCheckout) {
      logInfo('[Replay] Flushing initial segment without checkout.', this._options._experiments.traceInternals);
      // TODO FN: Evaluate if we want to stop here, or remove this again?
    }

    // this._flushLock acts as a lock so that future calls to `_flush()`
    // will be blocked until this promise resolves
    if (!this._flushLock) {
      this._flushLock = this._runFlush();
      await this._flushLock;
      this._flushLock = undefined;
      return;
    }

    // Wait for previous flush to finish, then call the debounced `_flush()`.
    // It's possible there are other flush requests queued and waiting for it
    // to resolve. We want to reduce all outstanding requests (as well as any
    // new flush requests that occur within a second of the locked flush
    // completing) into a single flush.

    try {
      await this._flushLock;
    } catch (err) {
      DEBUG_BUILD && logger.error(err);
    } finally {
      this._debouncedFlush();
    }
  };

  /** Save the session, if it is sticky */
  private _maybeSaveSession(): void {
    if (this.session && this._options.stickySession) {
      saveSession(this.session);
    }
  }

  /** Handler for rrweb.record.onMutation */
  private _onMutationHandler = (mutations: unknown[]): boolean => {
    const count = mutations.length;

    const mutationLimit = this._options.mutationLimit;
    const mutationBreadcrumbLimit = this._options.mutationBreadcrumbLimit;
    const overMutationLimit = mutationLimit && count > mutationLimit;

    // Create a breadcrumb if a lot of mutations happen at the same time
    // We can show this in the UI as an information with potential performance improvements
    if (count > mutationBreadcrumbLimit || overMutationLimit) {
      const breadcrumb = createBreadcrumb({
        category: 'replay.mutations',
        data: {
          count,
          limit: overMutationLimit,
        },
      });
      this._createCustomBreadcrumb(breadcrumb);
    }

    // Stop replay if over the mutation limit
    if (overMutationLimit) {
      // This should never reject
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.stop({ reason: 'mutationLimit', forceFlush: this.recordingMode === 'session' });
      return false;
    }

    // `true` means we use the regular mutation handling by rrweb
    return true;
  };
}
