/* eslint-disable max-lines */ // TODO: We might want to split this file up
import { addGlobalEventProcessor, captureException, getCurrentHub, setContext } from '@sentry/core';
import type { Breadcrumb, ReplayEvent, ReplayRecordingMode, TransportMakeRequestResponse } from '@sentry/types';
import { addInstrumentationHandler, logger } from '@sentry/utils';
import { EventType, record } from 'rrweb';

import {
  MAX_SESSION_LIFE,
  REPLAY_EVENT_NAME,
  SESSION_IDLE_DURATION,
  UNABLE_TO_SEND_REPLAY,
  VISIBILITY_CHANGE_TIMEOUT,
  WINDOW,
} from './constants';
import { breadcrumbHandler } from './coreHandlers/breadcrumbHandler';
import { handleFetchSpanListener } from './coreHandlers/handleFetch';
import { handleGlobalEventListener } from './coreHandlers/handleGlobalEvent';
import { handleHistorySpanListener } from './coreHandlers/handleHistory';
import { handleXhrSpanListener } from './coreHandlers/handleXhr';
import { setupPerformanceObserver } from './coreHandlers/performanceObserver';
import { createEventBuffer } from './eventBuffer';
import { getSession } from './session/getSession';
import { saveSession } from './session/saveSession';
import type {
  AddEventResult,
  AddUpdateCallback,
  AllPerformanceEntry,
  EventBuffer,
  InstrumentationTypeBreadcrumb,
  InternalEventContext,
  PopEventContext,
  RecordingEvent,
  RecordingOptions,
  ReplayContainer as ReplayContainerInterface,
  ReplayPluginOptions,
  SendReplay,
  Session,
} from './types';
import { addEvent } from './util/addEvent';
import { addMemoryEntry } from './util/addMemoryEntry';
import { createBreadcrumb } from './util/createBreadcrumb';
import { createPerformanceEntries } from './util/createPerformanceEntries';
import { createPerformanceSpans } from './util/createPerformanceSpans';
import { createRecordingData } from './util/createRecordingData';
import { createReplayEnvelope } from './util/createReplayEnvelope';
import { debounce } from './util/debounce';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { overwriteRecordDroppedEvent, restoreRecordDroppedEvent } from './util/monkeyPatchRecordDroppedEvent';
import { prepareReplayEvent } from './util/prepareReplayEvent';

/**
 * Returns true to return control to calling function, otherwise continue with normal batching
 */

const BASE_RETRY_INTERVAL = 5000;
const MAX_RETRY_COUNT = 3;

/**
 * The main replay container class, which holds all the state and methods for recording and sending replays.
 */
export class ReplayContainer implements ReplayContainerInterface {
  public eventBuffer: EventBuffer | null = null;

  /**
   * List of PerformanceEntry from PerformanceObserver
   */
  public performanceEvents: AllPerformanceEntry[] = [];

  public session: Session | undefined;

  /**
   * Recording can happen in one of two modes:
   * * session: Record the whole session, sending it continuously
   * * error: Always keep the last 60s of recording, and when an error occurs, send it immediately
   */
  public recordingMode: ReplayRecordingMode = 'session';

  /**
   * Options to pass to `rrweb.record()`
   */
  private readonly _recordingOptions: RecordingOptions;

  private readonly _options: ReplayPluginOptions;

  private _performanceObserver: PerformanceObserver | null = null;

  private _retryCount: number = 0;
  private _retryInterval: number = BASE_RETRY_INTERVAL;

  private _debouncedFlush: ReturnType<typeof debounce>;
  private _flushLock: Promise<unknown> | null = null;

  /**
   * Timestamp of the last user activity. This lives across sessions.
   */
  private _lastActivity: number = new Date().getTime();

  /**
   * Is the integration currently active?
   */
  private _isEnabled: boolean = false;

  /**
   * Paused is a state where:
   * - DOM Recording is not listening at all
   * - Nothing will be added to event buffer (e.g. core SDK events)
   */
  private _isPaused: boolean = false;

  /**
   * Have we attached listeners to the core SDK?
   * Note we have to track this as there is no way to remove instrumentation handlers.
   */
  private _hasInitializedCoreListeners: boolean = false;

  /**
   * Function to stop recording
   */
  private _stopRecording: ReturnType<typeof record> | null = null;

  private _context: InternalEventContext = {
    errorIds: new Set(),
    traceIds: new Set(),
    urls: [],
    earliestEvent: null,
    initialTimestamp: new Date().getTime(),
    initialUrl: '',
  };

  public constructor({
    options,
    recordingOptions,
  }: {
    options: ReplayPluginOptions;
    recordingOptions: RecordingOptions;
  }) {
    this._recordingOptions = recordingOptions;
    this._options = options;

    this._debouncedFlush = debounce(() => this._flush(), this._options.flushMinDelay, {
      maxWait: this._options.flushMaxDelay,
    });
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

  /** Get the replay integration options. */
  public getOptions(): ReplayPluginOptions {
    return this._options;
  }

  /**
   * Initializes the plugin.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM,
   * _performanceObserver, Recording, Sentry SDK, etc)
   */
  public start(): void {
    this._setInitialState();

    this._loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      this._handleException(new Error('No session found'));
      return;
    }

    if (!this.session.sampled) {
      // If session was not sampled, then we do not initialize the integration at all.
      return;
    }

    // If session is sampled for errors, then we need to set the recordingMode
    // to 'error', which will configure recording with different options.
    if (this.session.sampled === 'error') {
      this.recordingMode = 'error';
    }

    // setup() is generally called on page load or manually - in both cases we
    // should treat it as an activity
    this._updateSessionActivity();

    this.eventBuffer = createEventBuffer({
      useCompression: Boolean(this._options.useCompression),
    });

    this._addListeners();

    // Need to set as enabled before we start recording, as `record()` can trigger a flush with a new checkout
    this._isEnabled = true;

    this.startRecording();
  }

  /**
   * Start recording.
   *
   * Note that this will cause a new DOM checkout
   */
  public startRecording(): void {
    try {
      this._stopRecording = record({
        ...this._recordingOptions,
        // When running in error sampling mode, we need to overwrite `checkoutEveryNms`
        // Without this, it would record forever, until an error happens, which we don't want
        // instead, we'll always keep the last 60 seconds of replay before an error happened
        ...(this.recordingMode === 'error' && { checkoutEveryNms: 60000 }),
        emit: this._handleRecordingEmit,
      });
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Stops the recording, if it was running.
   * Returns true if it was stopped, else false.
   */
  public stopRecording(): boolean {
    if (this._stopRecording) {
      this._stopRecording();
      return true;
    }

    return false;
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  public stop(): void {
    try {
      __DEBUG_BUILD__ && logger.log('[Replay] Stopping Replays');
      this._isEnabled = false;
      this._removeListeners();
      this._stopRecording?.();
      this.eventBuffer?.destroy();
      this.eventBuffer = null;
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
    this._isPaused = true;
    try {
      if (this._stopRecording) {
        this._stopRecording();
        this._stopRecording = undefined;
      }
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Resumes recording, see notes for `pause().
   *
   * Note that calling `startRecording()` here will cause a
   * new DOM checkout.`
   */
  public resume(): void {
    this._isPaused = false;
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
    // We need to always run `cb` (e.g. in the case of `this.recordingMode == 'error'`)
    const cbResult = cb?.();

    // If this option is turned on then we will only want to call `flush`
    // explicitly
    if (this.recordingMode === 'error') {
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
      this._loadSession({ expiry: SESSION_IDLE_DURATION });

      // Note: This will cause a new DOM checkout
      this.resume();
      return;
    }

    // Otherwise... recording was never suspended, continue as normalish
    this._checkAndHandleExpiredSession();

    this._updateSessionActivity();
  }

  /**
   *
   * Always flush via `_debouncedFlush` so that we do not have flushes triggered
   * from calling both `flush` and `_debouncedFlush`. Otherwise, there could be
   * cases of mulitple flushes happening closely together.
   */
  public flushImmediate(): Promise<void> {
    this._debouncedFlush();
    // `.flush` is provided by the debounced function, analogously to lodash.debounce
    return this._debouncedFlush.flush() as Promise<void>;
  }

  /** A wrapper to conditionally capture exceptions. */
  private _handleException(error: unknown): void {
    __DEBUG_BUILD__ && logger.error('[Replay]', error);

    if (__DEBUG_BUILD__ && this._options._experiments && this._options._experiments.captureExceptions) {
      captureException(error);
    }
  }

  /**
   * Loads a session from storage, or creates a new one if it does not exist or
   * is expired.
   */
  private _loadSession({ expiry }: { expiry: number }): void {
    const { type, session } = getSession({
      expiry,
      stickySession: Boolean(this._options.stickySession),
      currentSession: this.session,
      sessionSampleRate: this._options.sessionSampleRate,
      errorSampleRate: this._options.errorSampleRate,
    });

    // If session was newly created (i.e. was not loaded from storage), then
    // enable flag to create the root replay
    if (type === 'new') {
      this._setInitialState();
    }

    if (session.id !== this.session?.id) {
      session.previousSessionId = this.session?.id;
    }

    this.session = session;
  }

  /**
   * Capture some initial state that can change throughout the lifespan of the
   * replay. This is required because otherwise they would be captured at the
   * first flush.
   */
  private _setInitialState(): void {
    const urlPath = `${WINDOW.location.pathname}${WINDOW.location.hash}${WINDOW.location.search}`;
    const url = `${WINDOW.location.origin}${urlPath}`;

    this.performanceEvents = [];

    // Reset _context as well
    this._clearContext();

    this._context.initialUrl = url;
    this._context.initialTimestamp = new Date().getTime();
    this._context.urls.push(url);
  }

  /**
   * Adds listeners to record events for the replay
   */
  private _addListeners(): void {
    try {
      WINDOW.document.addEventListener('visibilitychange', this._handleVisibilityChange);
      WINDOW.addEventListener('blur', this._handleWindowBlur);
      WINDOW.addEventListener('focus', this._handleWindowFocus);

      // We need to filter out dropped events captured by `addGlobalEventProcessor(this.handleGlobalEvent)` below
      overwriteRecordDroppedEvent(this._context.errorIds);

      // There is no way to remove these listeners, so ensure they are only added once
      if (!this._hasInitializedCoreListeners) {
        // Listeners from core SDK //
        const scope = getCurrentHub().getScope();
        scope?.addScopeListener(this._handleCoreBreadcrumbListener('scope'));
        addInstrumentationHandler('dom', this._handleCoreBreadcrumbListener('dom'));
        addInstrumentationHandler('fetch', handleFetchSpanListener(this));
        addInstrumentationHandler('xhr', handleXhrSpanListener(this));
        addInstrumentationHandler('history', handleHistorySpanListener(this));

        // Tag all (non replay) events that get sent to Sentry with the current
        // replay ID so that we can reference them later in the UI
        addGlobalEventProcessor(handleGlobalEventListener(this));

        this._hasInitializedCoreListeners = true;
      }
    } catch (err) {
      this._handleException(err);
    }

    // _performanceObserver //
    if (!('_performanceObserver' in WINDOW)) {
      return;
    }

    this._performanceObserver = setupPerformanceObserver(this);
  }

  /**
   * Cleans up listeners that were created in `_addListeners`
   */
  private _removeListeners(): void {
    try {
      WINDOW.document.removeEventListener('visibilitychange', this._handleVisibilityChange);

      WINDOW.removeEventListener('blur', this._handleWindowBlur);
      WINDOW.removeEventListener('focus', this._handleWindowFocus);

      restoreRecordDroppedEvent();

      if (this._performanceObserver) {
        this._performanceObserver.disconnect();
        this._performanceObserver = null;
      }
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Handler for recording events.
   *
   * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
   */
  private _handleRecordingEmit: (event: RecordingEvent, isCheckout?: boolean) => void = (
    event: RecordingEvent,
    isCheckout?: boolean,
  ) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!this._checkAndHandleExpiredSession()) {
      __DEBUG_BUILD__ && logger.error('[Replay] Received replay event after session expired.');

      return;
    }

    this.addUpdate(() => {
      // The session is always started immediately on pageload/init, but for
      // error-only replays, it should reflect the most recent checkout
      // when an error occurs. Clear any state that happens before this current
      // checkout. This needs to happen before `addEvent()` which updates state
      // dependent on this reset.
      if (this.recordingMode === 'error' && event.type === 2) {
        this._setInitialState();
      }

      // We need to clear existing events on a checkout, otherwise they are
      // incremental event updates and should be appended
      void addEvent(this, event, isCheckout);

      // Different behavior for full snapshots (type=2), ignore other event types
      // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
      if (event.type !== 2) {
        return false;
      }

      // If there is a previousSessionId after a full snapshot occurs, then
      // the replay session was started due to session expiration. The new session
      // is started before triggering a new checkout and contains the id
      // of the previous session. Do not immediately flush in this case
      // to avoid capturing only the checkout and instead the replay will
      // be captured if they perform any follow-up actions.
      if (this.session?.previousSessionId) {
        return true;
      }

      // See note above re: session start needs to reflect the most recent
      // checkout.
      if (this.recordingMode === 'error' && this.session && this._context.earliestEvent) {
        this.session.started = this._context.earliestEvent;
        this._maybeSaveSession();
      }

      // Flush immediately so that we do not miss the first segment, otherwise
      // it can prevent loading on the UI. This will cause an increase in short
      // replays (e.g. opening and closing a tab quickly), but these can be
      // filtered on the UI.
      if (this.recordingMode === 'session') {
        void this.flushImmediate();
      }

      return true;
    });
  };

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

  /**
   * Handler for Sentry Core SDK events.
   *
   * These events will create breadcrumb-like objects in the recording.
   */
  private _handleCoreBreadcrumbListener: (type: InstrumentationTypeBreadcrumb) => (handlerData: unknown) => void =
    (type: InstrumentationTypeBreadcrumb) =>
    (handlerData: unknown): void => {
      if (!this._isEnabled) {
        return;
      }

      const result = breadcrumbHandler(type, handlerData);

      if (result === null) {
        return;
      }

      if (result.category === 'sentry.transaction') {
        return;
      }

      if (result.category === 'ui.click') {
        this.triggerUserActivity();
      } else {
        this._checkAndHandleExpiredSession();
      }

      this.addUpdate(() => {
        void addEvent(this, {
          type: EventType.Custom,
          // TODO: We were converting from ms to seconds for breadcrumbs, spans,
          // but maybe we should just keep them as milliseconds
          timestamp: (result.timestamp || 0) * 1000,
          data: {
            tag: 'breadcrumb',
            payload: result,
          },
        });

        // Do not flush after console log messages
        return result.category === 'console';
      });
    };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  private _doChangeToBackgroundTasks(breadcrumb?: Breadcrumb): void {
    if (!this.session) {
      return;
    }

    const expired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb && !expired) {
      this._createCustomBreadcrumb(breadcrumb);
    }

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    this._conditionalFlush();
  }

  /**
   * Tasks to run when we consider a page to be visible (via focus and/or visibility)
   */
  private _doChangeToForegroundTasks(breadcrumb?: Breadcrumb): void {
    if (!this.session) {
      return;
    }

    const isSessionActive = this._checkAndHandleExpiredSession({
      expiry: VISIBILITY_CHANGE_TIMEOUT,
    });

    if (!isSessionActive) {
      // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
      // ms, we will re-use the existing session, otherwise create a new
      // session
      __DEBUG_BUILD__ && logger.log('[Replay] Document has become active, but session has expired');
      return;
    }

    if (breadcrumb) {
      this._createCustomBreadcrumb(breadcrumb);
    }
  }

  /**
   * Trigger rrweb to take a full snapshot which will cause this plugin to
   * create a new Replay event.
   */
  private _triggerFullSnapshot(): void {
    __DEBUG_BUILD__ && logger.log('[Replay] Taking full rrweb snapshot');
    record.takeFullSnapshot(true);
  }

  /**
   * Update user activity (across session lifespans)
   */
  private _updateUserActivity(_lastActivity: number = new Date().getTime()): void {
    this._lastActivity = _lastActivity;
  }

  /**
   * Updates the session's last activity timestamp
   */
  private _updateSessionActivity(_lastActivity: number = new Date().getTime()): void {
    if (this.session) {
      this.session.lastActivity = _lastActivity;
      this._maybeSaveSession();
    }
  }

  /**
   * Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
   */
  private _createCustomBreadcrumb(breadcrumb: Breadcrumb): void {
    this.addUpdate(() => {
      void addEvent(this, {
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
   * Observed performance events are added to `this.performanceEvents`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  private _addPerformanceEntries(): Promise<Array<AddEventResult | null>> {
    // Copy and reset entries before processing
    const entries = [...this.performanceEvents];
    this.performanceEvents = [];

    return Promise.all(createPerformanceSpans(this, createPerformanceEntries(entries)));
  }

  /**
   * Checks if recording should be stopped due to user inactivity. Otherwise
   * check if session is expired and create a new session if so. Triggers a new
   * full snapshot on new session.
   *
   * Returns true if session is not expired, false otherwise.
   */
  private _checkAndHandleExpiredSession({ expiry = SESSION_IDLE_DURATION }: { expiry?: number } = {}): boolean | void {
    const oldSessionId = this.session?.id;

    // Prevent starting a new session if the last user activity is older than
    // MAX_SESSION_LIFE. Otherwise non-user activity can trigger a new
    // session+recording. This creates noisy replays that do not have much
    // content in them.
    if (this._lastActivity && isExpired(this._lastActivity, MAX_SESSION_LIFE)) {
      // Pause recording
      this.pause();
      return;
    }

    // --- There is recent user activity --- //
    // This will create a new session if expired, based on expiry length
    this._loadSession({ expiry });

    // Session was expired if session ids do not match
    const expired = oldSessionId !== this.session?.id;

    if (!expired) {
      return true;
    }

    // Session is expired, trigger a full snapshot (which will create a new session)
    this._triggerFullSnapshot();

    return false;
  }

  /**
   * Only flush if `this.recordingMode === 'session'`
   */
  private _conditionalFlush(): void {
    if (this.recordingMode === 'error') {
      return;
    }

    void this.flushImmediate();
  }

  /**
   * Clear _context
   */
  private _clearContext(): void {
    // XXX: `initialTimestamp` and `initialUrl` do not get cleared
    this._context.errorIds.clear();
    this._context.traceIds.clear();
    this._context.urls = [];
    this._context.earliestEvent = null;
  }

  /**
   * Return and clear _context
   */
  private _popEventContext(): PopEventContext {
    if (this._context.earliestEvent && this._context.earliestEvent < this._context.initialTimestamp) {
      this._context.initialTimestamp = this._context.earliestEvent;
    }

    const _context = {
      initialTimestamp: this._context.initialTimestamp,
      initialUrl: this._context.initialUrl,
      errorIds: Array.from(this._context.errorIds).filter(Boolean),
      traceIds: Array.from(this._context.traceIds).filter(Boolean),
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
    if (!this.session) {
      __DEBUG_BUILD__ && logger.error('[Replay] No session found to flush.');
      return;
    }

    await this._addPerformanceEntries();

    if (!this.eventBuffer?.pendingLength) {
      return;
    }

    // Only attach memory event if eventBuffer is not empty
    await addMemoryEntry(this);

    try {
      // Note this empties the event buffer regardless of outcome of sending replay
      const recordingData = await this.eventBuffer.finish();

      // NOTE: Copy values from instance members, as it's possible they could
      // change before the flush finishes.
      const replayId = this.session.id;
      const eventContext = this._popEventContext();
      // Always increment segmentId regardless of outcome of sending replay
      const segmentId = this.session.segmentId++;
      this._maybeSaveSession();

      await this._sendReplay({
        replayId,
        events: recordingData,
        segmentId,
        includeReplayStartTimestamp: segmentId === 0,
        eventContext,
      });
    } catch (err) {
      this._handleException(err);
    }
  }

  /**
   * Flush recording data to Sentry. Creates a lock so that only a single flush
   * can be active at a time. Do not call this directly.
   */
  private _flush: () => Promise<void> = async () => {
    if (!this._isEnabled) {
      // This is just a precaution, there should be no listeners that would
      // cause a flush.
      return;
    }

    if (!this._checkAndHandleExpiredSession()) {
      __DEBUG_BUILD__ && logger.error('[Replay] Attempting to finish replay event after session expired.');
      return;
    }

    if (!this.session?.id) {
      __DEBUG_BUILD__ && logger.error('[Replay] No session found to flush.');
      return;
    }

    // A flush is about to happen, cancel any queued flushes
    this._debouncedFlush?.cancel();

    // this._flushLock acts as a lock so that future calls to `_flush()`
    // will be blocked until this promise resolves
    if (!this._flushLock) {
      this._flushLock = this._runFlush();
      await this._flushLock;
      this._flushLock = null;
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
      __DEBUG_BUILD__ && logger.error(err);
    } finally {
      this._debouncedFlush();
    }
  };

  /**
   * Send replay attachment using `fetch()`
   */
  private async _sendReplayRequest({
    events,
    replayId,
    segmentId: segment_id,
    includeReplayStartTimestamp,
    eventContext,
    timestamp = new Date().getTime(),
  }: SendReplay): Promise<void | TransportMakeRequestResponse> {
    const recordingData = createRecordingData({
      events,
      headers: {
        segment_id,
      },
    });

    const { urls, errorIds, traceIds, initialTimestamp } = eventContext;

    const hub = getCurrentHub();
    const client = hub.getClient();
    const scope = hub.getScope();
    const transport = client && client.getTransport();
    const dsn = client?.getDsn();

    if (!client || !scope || !transport || !dsn || !this.session || !this.session.sampled) {
      return;
    }

    const baseEvent: ReplayEvent = {
      // @ts-ignore private api
      type: REPLAY_EVENT_NAME,
      ...(includeReplayStartTimestamp ? { replay_start_timestamp: initialTimestamp / 1000 } : {}),
      timestamp: timestamp / 1000,
      error_ids: errorIds,
      trace_ids: traceIds,
      urls,
      replay_id: replayId,
      segment_id,
      replay_type: this.session.sampled,
    };

    const replayEvent = await prepareReplayEvent({ scope, client, replayId, event: baseEvent });

    if (!replayEvent) {
      // Taken from baseclient's `_processEvent` method, where this is handled for errors/transactions
      client.recordDroppedEvent('event_processor', 'replay_event', baseEvent);
      __DEBUG_BUILD__ && logger.log('An event processor returned `null`, will not send event.');
      return;
    }

    replayEvent.tags = {
      ...replayEvent.tags,
      sessionSampleRate: this._options.sessionSampleRate,
      errorSampleRate: this._options.errorSampleRate,
    };

    /*
    For reference, the fully built event looks something like this:
    {
        "type": "replay_event",
        "timestamp": 1670837008.634,
        "error_ids": [
            "errorId"
        ],
        "trace_ids": [
            "traceId"
        ],
        "urls": [
            "https://example.com"
        ],
        "replay_id": "eventId",
        "segment_id": 3,
        "replay_type": "error",
        "platform": "javascript",
        "event_id": "eventId",
        "environment": "production",
        "sdk": {
            "integrations": [
                "BrowserTracing",
                "Replay"
            ],
            "name": "sentry.javascript.browser",
            "version": "7.25.0"
        },
        "sdkProcessingMetadata": {},
        "tags": {
            "sessionSampleRate": 1,
            "errorSampleRate": 0,
        }
    }
    */

    const envelope = createReplayEnvelope(replayEvent, recordingData, dsn, client.getOptions().tunnel);

    try {
      return await transport.send(envelope);
    } catch {
      throw new Error(UNABLE_TO_SEND_REPLAY);
    }
  }

  /**
   * Reset the counter of retries for sending replays.
   */
  private _resetRetries(): void {
    this._retryCount = 0;
    this._retryInterval = BASE_RETRY_INTERVAL;
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  private async _sendReplay({
    replayId,
    events,
    segmentId,
    includeReplayStartTimestamp,
    eventContext,
  }: SendReplay): Promise<unknown> {
    // short circuit if there's no events to upload (this shouldn't happen as _runFlush makes this check)
    if (!events.length) {
      return;
    }

    try {
      await this._sendReplayRequest({
        events,
        replayId,
        segmentId,
        includeReplayStartTimestamp,
        eventContext,
      });
      this._resetRetries();
      return true;
    } catch (err) {
      // Capture error for every failed replay
      setContext('Replays', {
        _retryCount: this._retryCount,
      });
      this._handleException(err);

      // If an error happened here, it's likely that uploading the attachment
      // failed, we'll can retry with the same events payload
      if (this._retryCount >= MAX_RETRY_COUNT) {
        throw new Error(`${UNABLE_TO_SEND_REPLAY} - max retries exceeded`);
      }

      this._retryCount = this._retryCount + 1;
      // will retry in intervals of 5, 10, 30
      this._retryInterval = this._retryCount * this._retryInterval;

      return await new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            await this._sendReplay({
              replayId,
              events,
              segmentId,
              includeReplayStartTimestamp,
              eventContext,
            });
            resolve(true);
          } catch (err) {
            reject(err);
          }
        }, this._retryInterval);
      });
    }
  }

  /** Save the session, if it is sticky */
  private _maybeSaveSession(): void {
    if (this.session && this._options.stickySession) {
      saveSession(this.session);
    }
  }
}
