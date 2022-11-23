/* eslint-disable max-lines */ // TODO: We might want to split this file up
import { addGlobalEventProcessor, getCurrentHub, Scope, setContext } from '@sentry/core';
import { Breadcrumb, Client, Event, Integration } from '@sentry/types';
import { addInstrumentationHandler, createEnvelope } from '@sentry/utils';
import debounce from 'lodash.debounce';
import { PerformanceObserverEntryList } from 'perf_hooks';
import { EventType, record } from 'rrweb';

import { getBreadcrumbHandler } from './coreHandlers/getBreadcrumbHandler';
import { getSpanHandler } from './coreHandlers/getSpanHandler';
import { createMemoryEntry, createPerformanceEntries, ReplayPerformanceEntry } from './createPerformanceEntry';
import { createEventBuffer, IEventBuffer } from './eventBuffer';
import {
  DEFAULT_ERROR_SAMPLE_RATE,
  DEFAULT_SESSION_SAMPLE_RATE,
  MAX_SESSION_LIFE,
  REPLAY_EVENT_NAME,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { deleteSession } from './session/deleteSession';
import { getSession } from './session/getSession';
import { Session } from './session/Session';
import type {
  AllPerformanceEntry,
  InstrumentationTypeBreadcrumb,
  InstrumentationTypeSpan,
  InternalEventContext,
  PopEventContext,
  RecordingEvent,
  RecordingOptions,
  ReplayConfiguration,
  ReplayPluginOptions,
  SendReplay,
} from './types';
import { addInternalBreadcrumb } from './util/addInternalBreadcrumb';
import { captureInternalException } from './util/captureInternalException';
import { createBreadcrumb } from './util/createBreadcrumb';
import { createPayload } from './util/createPayload';
import { dedupePerformanceEntries } from './util/dedupePerformanceEntries';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';

/**
 * Returns true to return control to calling function, otherwise continue with normal batching
 */
type AddUpdateCallback = () => boolean | void;

const BASE_RETRY_INTERVAL = 5000;
const MAX_RETRY_COUNT = 3;
const UNABLE_TO_SEND_REPLAY = 'Unable to send Replay';
const MEDIA_SELECTORS = 'img,image,svg,path,rect,area,video,object,picture,embed,map,audio';

let _initialized = false;

const isBrowser = typeof window !== 'undefined';

export class Replay implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string = Replay.id;

  public eventBuffer: IEventBuffer | null;

  /**
   * List of PerformanceEntry from PerformanceObserver
   */
  public performanceEvents: AllPerformanceEntry[] = [];

  public session: Session | undefined;

  /**
   * Options to pass to `rrweb.record()`
   */
  readonly recordingOptions: RecordingOptions;

  readonly options: ReplayPluginOptions;

  private performanceObserver: PerformanceObserver | null = null;

  private retryCount: number = 0;
  private retryInterval: number = BASE_RETRY_INTERVAL;

  private debouncedFlush: ReturnType<typeof debounce>;
  private flushLock: Promise<unknown> | null = null;

  /**
   * Timestamp of the last user activity. This lives across sessions.
   */
  private lastActivity: number = new Date().getTime();

  /**
   * Is the integration currently active?
   */
  private isEnabled: boolean = false;

  /**
   * Paused is a state where:
   * - DOM Recording is not listening at all
   * - Nothing will be added to event buffer (e.g. core SDK events)
   */
  private isPaused: boolean = false;

  /**
   * Integration will wait until an error occurs before creating and sending a
   * replay.
   */
  private waitForError: boolean = false;

  /**
   * Have we attached listeners to the core SDK?
   * Note we have to track this as there is no way to remove instrumentation handlers.
   */
  private hasInitializedCoreListeners: boolean = false;

  /**
   * Function to stop recording
   */
  private stopRecording: ReturnType<typeof record> | null = null;

  private context: InternalEventContext = {
    errorIds: new Set(),
    traceIds: new Set(),
    urls: [],
    earliestEvent: null,
    initialTimestamp: new Date().getTime(),
    initialUrl: '',
  };

  constructor({
    flushMinDelay = 5000,
    flushMaxDelay = 15000,
    initialFlushDelay = 5000,
    stickySession = true,
    useCompression = true,
    sessionSampleRate = DEFAULT_SESSION_SAMPLE_RATE,
    errorSampleRate = DEFAULT_ERROR_SAMPLE_RATE,
    maskAllText = true,
    maskAllInputs = true,
    blockAllMedia = true,
    blockClass = 'sentry-block',
    ignoreClass = 'sentry-ignore',
    maskTextClass = 'sentry-mask',
    blockSelector = '[data-sentry-block]',
    // eslint-disable-next-line deprecation/deprecation
    replaysSamplingRate,
    // eslint-disable-next-line deprecation/deprecation
    captureOnlyOnError,
    ...recordingOptions
  }: ReplayConfiguration = {}) {
    this.recordingOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      blockSelector,
      ...recordingOptions,
    };

    const usingDeprecatedReplaysSamplingRate = replaysSamplingRate !== undefined;
    const usingDeprecatedCaptureOnlyOnError = captureOnlyOnError !== undefined;

    this.options = {
      flushMinDelay,
      flushMaxDelay,
      stickySession,
      initialFlushDelay,
      sessionSampleRate: usingDeprecatedReplaysSamplingRate ? (replaysSamplingRate as number) : sessionSampleRate,
      errorSampleRate: usingDeprecatedCaptureOnlyOnError ? 1.0 : errorSampleRate,
      useCompression,
      maskAllText,
      blockAllMedia,
    };

    // TODO(deprecated): Maintain backwards compatibility for alpha users
    if (usingDeprecatedCaptureOnlyOnError) {
      console.warn(
        '[@sentry/replay]: The `captureOnlyOnError` option is deprecated! Please configure `errorSampleRate` instead.',
      );
    }

    if (usingDeprecatedReplaysSamplingRate) {
      console.warn(
        '[@sentry/replay]: The `replaysSamplingRate` option is deprecated! Please configure `sessionSampleRate` instead.',
      );
    }

    if (this.options.maskAllText) {
      // `maskAllText` is a more user friendly option to configure
      // `maskTextSelector`. This means that all nodes will have their text
      // content masked.
      this.recordingOptions.maskTextSelector = '*';
    }

    if (this.options.blockAllMedia) {
      // `blockAllMedia` is a more user friendly option to configure blocking
      // embedded media elements
      this.recordingOptions.blockSelector = !this.recordingOptions.blockSelector
        ? MEDIA_SELECTORS
        : `${this.recordingOptions.blockSelector},${MEDIA_SELECTORS}`;
    }

    this.debouncedFlush = debounce(() => this.flush(), this.options.flushMinDelay, {
      maxWait: this.options.flushMaxDelay,
    });

    if (isBrowser && _initialized) {
      const error = new Error('Multiple Sentry Session Replay instances are not supported');
      captureInternalException(error);
      throw error;
    }
    _initialized = true;
  }

  /**
   * We previously used to create a transaction in `setupOnce` and it would
   * potentially create a transaction before some native SDK integrations have run
   * and applied their own global event processor. An example is:
   * https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
   *
   * So we call `this.setup` in next event loop as a workaround to wait for other
   * global event processors to finish. This is no longer needed, but keeping it
   * here to avoid any future issues.
   */
  setupOnce(): void {
    if (!isBrowser) {
      return;
    }
    // XXX: See method comments above
    window.setTimeout(() => this.start());
  }

  /**
   * Initializes the plugin.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM,
   * PerformanceObserver, Recording, Sentry SDK, etc)
   */
  start(): void {
    if (!isBrowser) {
      return;
    }

    this.setInitialState();

    this.loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      captureInternalException(new Error('Invalid session'));
      return;
    }

    if (!this.session.sampled) {
      // If session was not sampled, then we do not initialize the integration at all.
      return;
    }

    // Modify recording options to checkoutEveryNthSecond if
    // sampling for error replay. This is because we don't know
    // when an error will occur, so we need to keep a buffer of
    // replay events.
    if (this.session.sampled === 'error') {
      // Checkout every minute, meaning we only get up-to one minute of events before the error happens
      this.recordingOptions.checkoutEveryNms = 60000;
      this.waitForError = true;
    }

    // setup() is generally called on page load or manually - in both cases we
    // should treat it as an activity
    this.updateSessionActivity();

    this.eventBuffer = createEventBuffer({
      useCompression: Boolean(this.options.useCompression),
    });

    this.addListeners();

    this.startRecording();

    this.isEnabled = true;
  }

  /**
   * Start recording.
   *
   * Note that this will cause a new DOM checkout
   */
  startRecording(): void {
    try {
      this.stopRecording = record({
        ...this.recordingOptions,
        emit: this.handleRecordingEmit,
      });
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK
   * does not support a teardown
   */
  stop(): void {
    if (!isBrowser) {
      return;
    }

    try {
      logger.log('Stopping Replays');
      this.isEnabled = false;
      this.removeListeners();
      this.stopRecording?.();
      this.eventBuffer?.destroy();
      this.eventBuffer = null;
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }
  }

  /**
   * Pause some replay functionality. See comments for `isPaused`.
   * This differs from stop as this only stops DOM recording, it is
   * not as thorough of a shutdown as `stop()`.
   */
  pause(): void {
    this.isPaused = true;
    try {
      if (this.stopRecording) {
        this.stopRecording();
        this.stopRecording = undefined;
      }
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }
  }

  /**
   * Resumes recording, see notes for `pause().
   *
   * Note that calling `startRecording()` here will cause a
   * new DOM checkout.`
   */
  resume(): void {
    this.isPaused = false;
    this.startRecording();
  }

  clearSession(): void {
    try {
      deleteSession();
      this.session = undefined;
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }
  }

  /**
   * Loads a session from storage, or creates a new one if it does not exist or
   * is expired.
   */
  loadSession({ expiry }: { expiry: number }): void {
    const { type, session } = getSession({
      expiry,
      stickySession: Boolean(this.options.stickySession),
      currentSession: this.session,
      sessionSampleRate: this.options.sessionSampleRate,
      errorSampleRate: this.options.errorSampleRate,
    });

    // If session was newly created (i.e. was not loaded from storage), then
    // enable flag to create the root replay
    if (type === 'new') {
      this.setInitialState();
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
  setInitialState(): void {
    const urlPath = `${window.location.pathname}${window.location.hash}${window.location.search}`;
    const url = `${window.location.origin}${urlPath}`;

    this.performanceEvents = [];

    // Reset context as well
    this.clearContext();

    this.context.initialUrl = url;
    this.context.initialTimestamp = new Date().getTime();
    this.context.urls.push(url);
  }

  /**
   * Adds listeners to record events for the replay
   */
  addListeners(): void {
    try {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('blur', this.handleWindowBlur);
      window.addEventListener('focus', this.handleWindowFocus);

      // There is no way to remove these listeners, so ensure they are only added once
      if (!this.hasInitializedCoreListeners) {
        // Listeners from core SDK //
        const scope = getCurrentHub().getScope();
        scope?.addScopeListener(this.handleCoreBreadcrumbListener('scope'));
        addInstrumentationHandler('dom', this.handleCoreBreadcrumbListener('dom'));
        addInstrumentationHandler('fetch', this.handleCoreSpanListener('fetch'));
        addInstrumentationHandler('xhr', this.handleCoreSpanListener('xhr'));
        addInstrumentationHandler('history', this.handleCoreSpanListener('history'));

        // Tag all (non replay) events that get sent to Sentry with the current
        // replay ID so that we can reference them later in the UI
        addGlobalEventProcessor(this.handleGlobalEvent);

        this.hasInitializedCoreListeners = true;
      }
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }

    // PerformanceObserver //
    if (!('PerformanceObserver' in window)) {
      return;
    }

    this.performanceObserver = new PerformanceObserver(this.handlePerformanceObserver);

    // Observe almost everything for now (no mark/measure)
    [
      'element',
      'event',
      'first-input',
      'largest-contentful-paint',
      'layout-shift',
      'longtask',
      'navigation',
      'paint',
      'resource',
    ].forEach(type => {
      try {
        this.performanceObserver?.observe({
          type,
          buffered: true,
        });
      } catch {
        // This can throw if an entry type is not supported in the browser.
        // Ignore these errors.
      }
    });
  }

  /**
   * Cleans up listeners that were created in `addListeners`
   */
  removeListeners(): void {
    try {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);

      window.removeEventListener('blur', this.handleWindowBlur);
      window.removeEventListener('focus', this.handleWindowFocus);

      if (this.performanceObserver) {
        this.performanceObserver.disconnect();
        this.performanceObserver = null;
      }
    } catch (err) {
      logger.error(err);
      captureInternalException(err);
    }
  }

  /**
   * We want to batch uploads of replay events. Save events only if
   * `<flushMinDelay>` milliseconds have elapsed since the last event
   * *OR* if `<flushMaxDelay>` milliseconds have elapsed.
   *
   * Accepts a callback to perform side-effects and returns true to stop batch
   * processing and hand back control to caller.
   */
  addUpdate(cb?: AddUpdateCallback): void {
    // We need to always run `cb` (e.g. in the case of `this.waitForError == true`)
    const cbResult = cb?.();

    // If this option is turned on then we will only want to call `flush`
    // explicitly
    if (this.waitForError) {
      return;
    }

    // If callback is true, we do not want to continue with flushing -- the
    // caller will need to handle it.
    if (cbResult === true) {
      return;
    }

    // addUpdate is called quite frequently - use debouncedFlush so that it
    // respects the flush delays and does not flush immediately
    this.debouncedFlush();
  }

  /**
   * Core Sentry SDK global event handler. Attaches `replayId` to all [non-replay]
   * events as a tag. Also handles the case where we only want to capture a reply
   * when an error occurs.
   **/
  handleGlobalEvent: (event: Event) => Event = (event: Event) => {
    // Do not apply replayId to the root event
    if (
      // @ts-ignore new event type
      event.type === REPLAY_EVENT_NAME
    ) {
      // Replays have separate set of breadcrumbs, do not include breadcrumbs
      // from core SDK
      delete event.breadcrumbs;
      return event;
    }

    // Only tag transactions with replayId if not waiting for an error
    if (event.type !== 'transaction' || !this.waitForError) {
      event.tags = { ...event.tags, replayId: this.session?.id };
    }

    // Collect traceIds in context regardless of `waitForError` - if it's true,
    // context gets cleared on every checkout
    if (event.type === 'transaction') {
      this.context.traceIds.add(String(event.contexts?.trace?.trace_id || ''));
      return event;
    }

    // XXX: Is it safe to assume that all other events are error events?
    // @ts-ignore: Type 'undefined' is not assignable to type 'string'.ts(2345)
    this.context.errorIds.add(event.event_id);

    const exc = event.exception?.values?.[0];
    addInternalBreadcrumb({
      message: `Tagging event (${event.event_id}) - ${event.message} - ${exc?.type || 'Unknown'}: ${
        exc?.value || 'n/a'
      }`,
    });

    // Need to be very careful that this does not cause an infinite loop
    if (
      this.waitForError &&
      event.exception &&
      event.message !== UNABLE_TO_SEND_REPLAY // ignore this error because otherwise we could loop indefinitely with trying to capture replay and failing
    ) {
      setTimeout(async () => {
        // Allow flush to complete before resuming as a session recording, otherwise
        // the checkout from `startRecording` may be included in the payload.
        // Prefer to keep the error replay as a separate (and smaller) segment
        // than the session replay.
        await this.flushImmediate();

        if (this.stopRecording) {
          this.stopRecording();
          // Reset all "capture on error" configuration before
          // starting a new recording
          delete this.recordingOptions.checkoutEveryNms;
          this.waitForError = false;
          this.startRecording();
        }
      });
    }

    return event;
  };

  /**
   * Handler for recording events.
   *
   * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
   */
  handleRecordingEmit: (event: RecordingEvent, isCheckout?: boolean) => void = (
    event: RecordingEvent,
    isCheckout?: boolean,
  ) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(new Error('Received replay event after session expired.'));

      return;
    }

    this.addUpdate(() => {
      // The session is always started immediately on pageload/init, but for
      // error-only replays, it should reflect the most recent checkout
      // when an error occurs. Clear any state that happens before this current
      // checkout. This needs to happen before `addEvent()` which updates state
      // dependent on this reset.
      if (this.waitForError && event.type === 2) {
        this.setInitialState();
      }

      // We need to clear existing events on a checkout, otherwise they are
      // incremental event updates and should be appended
      this.addEvent(event, isCheckout);

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
      if (this.waitForError && this.session && this.context.earliestEvent) {
        this.session.started = this.context.earliestEvent;
      }

      // If the full snapshot is due to an initial load, we will not have
      // a previous session ID. In this case, we want to buffer events
      // for a set amount of time before flushing. This can help avoid
      // capturing replays of users that immediately close the window.
      setTimeout(() => this.conditionalFlush(), this.options.initialFlushDelay);

      // Cancel any previously debounced flushes to ensure there are no [near]
      // simultaneous flushes happening. The latter request should be
      // insignificant in this case, so wait for additional user interaction to
      // trigger a new flush.
      //
      // This can happen because there's no guarantee that a recording event
      // happens first. e.g. a mouse click can happen and trigger a debounced
      // flush before the checkout.
      this.debouncedFlush?.cancel();

      return true;
    });
  };

  /**
   * Handle when visibility of the page content changes. Opening a new tab will
   * cause the state to change to hidden because of content of current page will
   * be hidden. Likewise, moving a different window to cover the contents of the
   * page will also trigger a change to a hidden state.
   */
  handleVisibilityChange: () => void = () => {
    if (document.visibilityState === 'visible') {
      this.doChangeToForegroundTasks();
    } else {
      this.doChangeToBackgroundTasks();
    }
  };

  /**
   * Handle when page is blurred
   */
  handleWindowBlur: () => void = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.blur',
    });

    // Do not count blur as a user action -- it's part of the process of them
    // leaving the page
    this.doChangeToBackgroundTasks(breadcrumb);
  };

  /**
   * Handle when page is focused
   */
  handleWindowFocus: () => void = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.focus',
    });

    // Do not count focus as a user action -- instead wait until they focus and
    // interactive with page
    this.doChangeToForegroundTasks(breadcrumb);
  };

  /**
   * Handler for Sentry Core SDK events.
   *
   * These specific events will create span-like objects in the recording.
   */
  handleCoreSpanListener: (type: InstrumentationTypeSpan) => (handlerData: any) => void =
    (type: InstrumentationTypeSpan) => (handlerData: any) => {
      if (!this.isEnabled) {
        return;
      }

      const handler = getSpanHandler(type);
      const result = handler(handlerData);

      if (result === null) {
        return;
      }

      if (type === 'history') {
        // Need to collect visited URLs
        this.context.urls.push(result.name);
        this.triggerUserActivity();
      }

      this.addUpdate(() => {
        this.createPerformanceSpans([result as ReplayPerformanceEntry]);
        // Returning true will cause `addUpdate` to not flush
        // We do not want network requests to cause a flush. This will prevent
        // recurring/polling requests from keeping the replay session alive.
        return ['xhr', 'fetch'].includes(type);
      });
    };

  /**
   * Handler for Sentry Core SDK events.
   *
   * These events will create breadcrumb-like objects in the recording.
   */
  handleCoreBreadcrumbListener: (type: InstrumentationTypeBreadcrumb) => (handlerData: any) => void =
    (type: InstrumentationTypeBreadcrumb) => (handlerData: any) => {
      if (!this.isEnabled) {
        return;
      }

      const handler = getBreadcrumbHandler(type);
      const result = handler(handlerData);

      if (result === null) {
        return;
      }

      if (result.category === 'sentry.transaction') {
        return;
      }

      if (result.category === 'ui.click') {
        this.triggerUserActivity();
      } else {
        this.checkAndHandleExpiredSession();
      }

      this.addUpdate(() => {
        this.addEvent({
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
   * Keep a list of performance entries that will be sent with a replay
   */
  handlePerformanceObserver: (list: PerformanceObserverEntryList) => void = (list: PerformanceObserverEntryList) => {
    // For whatever reason the observer was returning duplicate navigation
    // entries (the other entry types were not duplicated).
    const newPerformanceEntries = dedupePerformanceEntries(
      this.performanceEvents,
      list.getEntries() as AllPerformanceEntry[],
    );
    this.performanceEvents = newPerformanceEntries;
  };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  doChangeToBackgroundTasks(breadcrumb?: Breadcrumb): void {
    if (!this.session) {
      return;
    }

    const expired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb && !expired) {
      this.createCustomBreadcrumb(breadcrumb);
    }

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    this.conditionalFlush();
  }

  /**
   * Tasks to run when we consider a page to be visible (via focus and/or visibility)
   */
  doChangeToForegroundTasks(breadcrumb?: Breadcrumb): void {
    if (!this.session) {
      return;
    }

    const isSessionActive = this.checkAndHandleExpiredSession({
      expiry: VISIBILITY_CHANGE_TIMEOUT,
    });

    if (!isSessionActive) {
      // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
      // ms, we will re-use the existing session, otherwise create a new
      // session
      logger.log('Document has become active, but session has expired');
      return;
    }

    if (breadcrumb) {
      this.createCustomBreadcrumb(breadcrumb);
    }
  }

  /**
   * Trigger rrweb to take a full snapshot which will cause this plugin to
   * create a new Replay event.
   */
  triggerFullSnapshot(): void {
    logger.log('Taking full rrweb snapshot');
    record.takeFullSnapshot(true);
  }

  /**
   * Add an event to the event buffer
   */
  addEvent(event: RecordingEvent, isCheckout?: boolean): void {
    if (!this.eventBuffer) {
      // This implies that `isEnabled` is false
      return;
    }

    if (this.isPaused) {
      // Do not add to event buffer when recording is paused
      return;
    }

    // TODO: sadness -- we will want to normalize timestamps to be in ms -
    // requires coordination with frontend
    const isMs = event.timestamp > 9999999999;
    const timestampInMs = isMs ? event.timestamp : event.timestamp * 1000;

    // Throw out events that happen more than 5 minutes ago. This can happen if
    // page has been left open and idle for a long period of time and user
    // comes back to trigger a new session. The performance entries rely on
    // `performance.timeOrigin`, which is when the page first opened.
    if (timestampInMs + SESSION_IDLE_DURATION < new Date().getTime()) {
      return;
    }

    // Only record earliest event if a new session was created, otherwise it
    // shouldn't be relevant
    if (this.session?.segmentId === 0 && (!this.context.earliestEvent || timestampInMs < this.context.earliestEvent)) {
      this.context.earliestEvent = timestampInMs;
    }

    this.eventBuffer.addEvent(event, isCheckout);
  }

  /**
   * Update user activity (across session lifespans)
   */
  updateUserActivity(lastActivity: number = new Date().getTime()): void {
    this.lastActivity = lastActivity;
  }

  /**
   * Updates the session's last activity timestamp
   */
  updateSessionActivity(lastActivity: number = new Date().getTime()): void {
    if (this.session) {
      this.session.lastActivity = lastActivity;
    }
  }

  /**
   * Updates the user activity timestamp and resumes recording. This should be
   * called in an event handler for a user action that we consider as the user
   * being "active" (e.g. a mouse click).
   */
  async triggerUserActivity(): Promise<void> {
    this.updateUserActivity();

    // This case means that recording was once stopped due to inactivity.
    // Ensure that recording is resumed.
    if (!this.stopRecording) {
      // Create a new session, otherwise when the user action is flushed, it
      // will get rejected due to an expired session.
      this.loadSession({ expiry: SESSION_IDLE_DURATION });

      // Note: This will cause a new DOM checkout
      this.resume();
      return;
    }

    // Otherwise... recording was never suspended, continue as normalish
    this.checkAndHandleExpiredSession();

    this.updateSessionActivity();
  }

  /**
   * Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
   */
  createCustomBreadcrumb(breadcrumb: Breadcrumb): void {
    this.addUpdate(() => {
      this.addEvent({
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
   * Create a "span" for each performance entry. The parent transaction is `this.replayEvent`.
   */
  createPerformanceSpans(entries: ReplayPerformanceEntry[]): Promise<void[]> {
    return Promise.all(
      entries.map(({ type, start, end, name, data }) =>
        this.addEvent({
          type: EventType.Custom,
          timestamp: start,
          data: {
            tag: 'performanceSpan',
            payload: {
              op: type,
              description: name,
              startTimestamp: start,
              endTimestamp: end,
              data,
            },
          },
        }),
      ),
    );
  }

  /**
   * Observed performance events are added to `this.performanceEvents`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  addPerformanceEntries(): Promise<void[]> {
    // Copy and reset entries before processing
    const entries = [...this.performanceEvents];
    this.performanceEvents = [];

    return this.createPerformanceSpans(createPerformanceEntries(entries));
  }

  /**
   * Create a "span" for the total amount of memory being used by JS objects
   * (including v8 internal objects).
   */
  addMemoryEntry(): Promise<void[]> | undefined {
    // window.performance.memory is a non-standard API and doesn't work on all browsers
    // so we check before creating the event.
    if (!('memory' in window.performance)) {
      return;
    }

    return this.createPerformanceSpans([
      // @ts-ignore memory doesn't exist on type Performance as the API is non-standard (we check that it exists above)
      createMemoryEntry(window.performance.memory),
    ]);
  }

  /**
   * Checks if recording should be stopped due to user inactivity. Otherwise
   * check if session is expired and create a new session if so. Triggers a new
   * full snapshot on new session.
   *
   * Returns true if session is not expired, false otherwise.
   */
  checkAndHandleExpiredSession({ expiry = SESSION_IDLE_DURATION }: { expiry?: number } = {}): boolean | void {
    const oldSessionId = this.session?.id;

    // Prevent starting a new session if the last user activity is older than
    // MAX_SESSION_LIFE. Otherwise non-user activity can trigger a new
    // session+recording. This creates noisy replays that do not have much
    // content in them.
    if (this.lastActivity && isExpired(this.lastActivity, MAX_SESSION_LIFE)) {
      // Pause recording
      this.pause();
      return;
    }

    // --- There is recent user activity --- //
    // This will create a new session if expired, based on expiry length
    this.loadSession({ expiry });

    // Session was expired if session ids do not match
    const expired = oldSessionId !== this.session?.id;

    if (!expired) {
      return true;
    }

    // Session is expired, trigger a full snapshot (which will create a new session)
    this.triggerFullSnapshot();

    return false;
  }

  /**
   * Only flush if `this.waitForError` is false.
   */
  conditionalFlush(): void {
    if (this.waitForError) {
      return;
    }

    this.flushImmediate();
  }

  /**
   * Clear context
   */
  clearContext(): void {
    // XXX: `initialTimestamp` and `initialUrl` do not get cleared
    this.context.errorIds.clear();
    this.context.traceIds.clear();
    this.context.urls = [];
    this.context.earliestEvent = null;
  }

  /**
   * Return and clear context
   */
  popEventContext(): PopEventContext {
    if (this.context.earliestEvent && this.context.earliestEvent < this.context.initialTimestamp) {
      this.context.initialTimestamp = this.context.earliestEvent;
    }

    const context = {
      initialTimestamp: this.context.initialTimestamp,
      initialUrl: this.context.initialUrl,
      errorIds: Array.from(this.context.errorIds).filter(Boolean),
      traceIds: Array.from(this.context.traceIds).filter(Boolean),
      urls: this.context.urls,
    };

    this.clearContext();

    return context;
  }

  /**
   * Flushes replay event buffer to Sentry.
   *
   * Performance events are only added right before flushing - this is
   * due to the buffered performance observer events.
   *
   * Should never be called directly, only by `flush`
   */
  async runFlush(): Promise<void> {
    if (!this.session) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    await this.addPerformanceEntries();

    if (!this.eventBuffer?.length) {
      return;
    }

    // Only attach memory event if eventBuffer is not empty
    await this.addMemoryEntry();

    try {
      // Note this empties the event buffer regardless of outcome of sending replay
      const recordingData = await this.eventBuffer.finish();

      // NOTE: Copy values from instance members, as it's possible they could
      // change before the flush finishes.
      const replayId = this.session.id;
      const eventContext = this.popEventContext();
      // Always increment segmentId regardless of outcome of sending replay
      const segmentId = this.session.segmentId++;

      await this.sendReplay({
        replayId,
        events: recordingData,
        segmentId,
        includeReplayStartTimestamp: segmentId === 0,
        eventContext,
      });
    } catch (err) {
      captureInternalException(err);
      console.error(err);
    }
  }

  /**
   * Flush recording data to Sentry. Creates a lock so that only a single flush
   * can be active at a time. Do not call this directly.
   */
  flush: () => Promise<void> = async () => {
    if (!this.isEnabled) {
      // This is just a precaution, there should be no listeners that would
      // cause a flush.
      return;
    }

    if (!this.checkAndHandleExpiredSession()) {
      logger.error(new Error('Attempting to finish replay event after session expired.'));
      return;
    }

    if (!this.session?.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    // A flush is about to happen, cancel any queued flushes
    this.debouncedFlush?.cancel();

    // No existing flush in progress, proceed with flushing.
    // this.flushLock acts as a lock so that future calls to `flush()`
    // will be blocked until this promise resolves
    if (!this.flushLock) {
      this.flushLock = this.runFlush();
      await this.flushLock;
      this.flushLock = null;
      return;
    }

    // Wait for previous flush to finish, then call the debounced `flush()`.
    // It's possible there are other flush requests queued and waiting for it
    // to resolve. We want to reduce all outstanding requests (as well as any
    // new flush requests that occur within a second of the locked flush
    // completing) into a single flush.

    try {
      await this.flushLock;
    } catch (err) {
      console.error(err);
    } finally {
      this.debouncedFlush();
    }
  };

  /**
   *
   * Always flush via `debouncedFlush` so that we do not have flushes triggered
   * from calling both `flush` and `debouncedFlush`. Otherwise, there could be
   * cases of mulitple flushes happening closely together.
   */
  flushImmediate(): any {
    this.debouncedFlush();
    // `.flush` is provided by lodash.debounce
    return this.debouncedFlush.flush();
  }

  /**
   * Send replay attachment using `fetch()`
   */
  async sendReplayRequest({
    events,
    replayId: event_id,
    segmentId: segment_id,
    includeReplayStartTimestamp,
    eventContext,
  }: SendReplay): Promise<void | undefined> {
    const payloadWithSequence = createPayload({
      events,
      headers: {
        segment_id,
      },
    });

    const { urls, errorIds, traceIds, initialTimestamp } = eventContext;

    const currentTimestamp = new Date().getTime();

    const sdkInfo = {
      name: 'sentry.javascript.integration.replay',
      version: __SENTRY_REPLAY_VERSION__,
    };

    const replayEvent = await new Promise(resolve => {
      getCurrentHub()
        // @ts-ignore private api
        ?._withClient(async (client: Client, scope: Scope) => {
          // XXX: This event does not trigger `beforeSend` in SDK
          // @ts-ignore private api
          const preparedEvent: Event = await client._prepareEvent(
            {
              type: REPLAY_EVENT_NAME,
              ...(includeReplayStartTimestamp ? { replay_start_timestamp: initialTimestamp / 1000 } : {}),
              timestamp: currentTimestamp / 1000,
              error_ids: errorIds,
              trace_ids: traceIds,
              urls,
              replay_id: event_id,
              segment_id,
            },
            { event_id },
            scope,
          );
          const session = scope && scope.getSession();
          if (session) {
            // @ts-ignore private api
            client._updateSessionFromEvent(session, preparedEvent);
          }

          preparedEvent.sdk = {
            ...preparedEvent.sdk,
            ...sdkInfo,
          };

          preparedEvent.tags = {
            ...preparedEvent.tags,
            sessionSampleRate: this.options.sessionSampleRate,
            errorSampleRate: this.options.errorSampleRate,
            replayType: this.session?.sampled,
          };

          resolve(preparedEvent);
        });
    });

    const envelope = createEnvelope(
      {
        event_id,
        sent_at: new Date().toISOString(),
        sdk: sdkInfo,
      },
      [
        // @ts-ignore New types
        [{ type: 'replay_event' }, replayEvent],
        [
          {
            // @ts-ignore setting envelope
            type: 'replay_recording',
            length: payloadWithSequence.length,
          },
          // @ts-ignore: Type 'string' is not assignable to type 'ClientReport'.ts(2322)
          payloadWithSequence,
        ],
      ],
    );

    const client = getCurrentHub().getClient();
    try {
      return client?.getTransport()?.send(envelope);
    } catch {
      throw new Error(UNABLE_TO_SEND_REPLAY);
    }
  }

  resetRetries(): void {
    this.retryCount = 0;
    this.retryInterval = BASE_RETRY_INTERVAL;
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  async sendReplay({
    replayId,
    events,
    segmentId,
    includeReplayStartTimestamp,
    eventContext,
  }: SendReplay): Promise<unknown> {
    // short circuit if there's no events to upload (this shouldn't happen as runFlush makes this check)
    if (!events.length) {
      return;
    }

    try {
      await this.sendReplayRequest({
        events,
        replayId,
        segmentId,
        includeReplayStartTimestamp,
        eventContext,
      });
      this.resetRetries();
      return true;
    } catch (ex) {
      console.error(ex);
      // Capture error for every failed replay
      setContext('Replays', {
        retryCount: this.retryCount,
      });
      captureInternalException(ex);

      // If an error happened here, it's likely that uploading the attachment
      // failed, we'll can retry with the same events payload
      if (this.retryCount >= MAX_RETRY_COUNT) {
        throw new Error(`${UNABLE_TO_SEND_REPLAY} - max retries exceeded`);
      }

      this.retryCount = this.retryCount + 1;
      // will retry in intervals of 5, 10, 30
      this.retryInterval = this.retryCount * this.retryInterval;

      return await new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            await this.sendReplay({
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
        }, this.retryInterval);
      });
    }
  }
}
