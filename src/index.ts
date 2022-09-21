import {
  addGlobalEventProcessor,
  captureException,
  getCurrentHub,
  getEnvelopeEndpointWithUrlEncodedAuth,
  setContext,
} from '@sentry/core';
import { Breadcrumb, Event, Integration } from '@sentry/types';
import { addInstrumentationHandler } from '@sentry/utils';
import { createEnvelope, serializeEnvelope } from '@sentry/utils';
import debounce from 'lodash.debounce';
import throttle from 'lodash.throttle';
import { EventType, record } from 'rrweb';

import {
  captureReplayEvent,
  CaptureReplayEventParams,
} from './api/captureReplayEvent';
import { getBreadcrumbHandler } from './coreHandlers/getBreadcrumbHandler';
import { getSpanHandler } from './coreHandlers/getSpanHandler';
import {
  REPLAY_EVENT_NAME,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { deleteSession } from './session/deleteSession';
import { getSession } from './session/getSession';
import { Session } from './session/Session';
import createBreadcrumb from './util/createBreadcrumb';
import { createPayload } from './util/createPayload';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';
import {
  createMemoryEntry,
  createPerformanceEntries,
  ReplayPerformanceEntry,
} from './createPerformanceEntry';
import { createEventBuffer, IEventBuffer } from './eventBuffer';
import type {
  AllPerformanceEntry,
  InitialState,
  InstrumentationTypeBreadcrumb,
  InstrumentationTypeSpan,
  RecordedEvents,
  RecordingConfig,
  RecordingEvent,
  ReplayEventContext,
  ReplayRequest,
  SentryReplayConfiguration,
  SentryReplayPluginOptions,
} from './types';

/**
 * Returns true to return control to calling function, otherwise continue with normal batching
 */
type AddUpdateCallback = () => boolean | void;

const BASE_RETRY_INTERVAL = 5000;
const MAX_RETRY_COUNT = 3;
const UNABLE_TO_SEND_REPLAY = 'Unable to send Replay';

export class SentryReplay implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string = SentryReplay.id;

  public eventBuffer: IEventBuffer | null;

  /**
   * List of PerformanceEntry from PerformanceObserver
   */
  public performanceEvents: AllPerformanceEntry[] = [];

  /**
   * Options to pass to `rrweb.record()`
   */
  readonly recordingOptions: RecordingConfig;

  readonly options: SentryReplayPluginOptions;

  /**
   * The timestamp of the first event since the last flush. This is used to
   * determine if the maximum allowed time has passed before events should be
   * flushed again.
   */
  private initialEventTimestampSinceFlush: number | null = null;

  private performanceObserver: PerformanceObserver | null = null;

  private retryCount = 0;
  private retryInterval = BASE_RETRY_INTERVAL;

  private debouncedFlush: ReturnType<typeof debounce>;

  /**
   * Flag when a new session has been created. Captured replay events behave
   * slightly differently in this case: `replay_start_timestamp` is included.
   */
  private newSessionCreated = false;

  private flushLock: Promise<unknown> | null = null;

  /**
   * Is the integration currently active?
   */
  private isEnabled = false;

  /**
   * Have we attached listeners to the core SDK?
   * Note we have to track this as there is no way to remove instrumentation handlers.
   */
  private hasInitializedCoreListeners = false;

  /**
   * Function to stop recording
   */
  private stopRecording: ReturnType<typeof record> | null = null;

  /**
   * Captured state when integration is first initialized
   */
  private initialState: InitialState;

  private context: ReplayEventContext = {
    errorIds: new Set(),
    traceIds: new Set(),
    urls: [],
    earliestEvent: null,
  };

  session: Session | undefined;

  constructor({
    flushMinDelay = 5000,
    flushMaxDelay = 15000,
    initialFlushDelay = 5000,
    stickySession = true,
    useCompression = true,
    captureOnlyOnError = false,
    replaysSamplingRate = 1.0,
    maskAllText = false,
    recordingConfig: {
      maskAllInputs = true,
      blockClass = 'sentry-block',
      ignoreClass = 'sentry-ignore',
      maskTextClass = 'sentry-mask',
      ...recordingOptions
    } = {},
  }: SentryReplayConfiguration = {}) {
    this.recordingOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      ...recordingOptions,
    };

    this.options = {
      flushMinDelay,
      flushMaxDelay,
      stickySession,
      initialFlushDelay,
      captureOnlyOnError,
      replaysSamplingRate,
      useCompression,
      maskAllText,
    };

    // Modify rrweb options to checkoutEveryNthSecond if this is defined, as we don't know when an error occurs, so we want to try to minimize the number of events captured.
    if (this.options.captureOnlyOnError) {
      // Checkout every minute, meaning we only get up-to one minute of events before the error happens
      this.recordingOptions.checkoutEveryNms = 60000;
    }

    if (this.options.maskAllText) {
      // `maskAllText` is a more user friendly option to configure
      // `maskTextSelector`. This means that all nodes will have their text
      // content masked.
      this.recordingOptions.maskTextSelector = '*';
    }

    this.debouncedFlush = debounce(
      () => this.flush(),
      this.options.flushMinDelay,
      {
        maxWait: this.options.flushMaxDelay,
      }
    );
  }

  /**
   * Because we create a transaction in `setupOnce`, we can potentially create a
   * transaction before some native SDK integrations have run and applied their
   * own global event processor. An example is:
   * https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
   *
   * So we call `this.setup` in next event loop as a workaround to wait for
   * other global event processors to finish
   */
  setupOnce() {
    // XXX: See method comments above
    window.setTimeout(() => this.start());
  }

  /**
   * Initializes the plugin.
   *
   * Creates or loads a session, attaches listeners to varying events (DOM, PerformanceObserver, Recording, Sentry SDK, etc)
   */
  start() {
    this.loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      throw new Error('Invalid session');
    }

    if (!this.session.sampled) {
      // If session was not sampled, then we do not initialize the integration at all.
      return;
    }

    // setup() is generally called on page load or manually - in both cases we
    // should treat it as an activity
    this.updateLastActivity();

    this.eventBuffer = createEventBuffer({
      useCompression: Boolean(this.options.useCompression),
    });

    this.addListeners();

    // Tag all (non replay) events that get sent to Sentry with the current
    // replay ID so that we can reference them later in the UI
    addGlobalEventProcessor(this.handleGlobalEvent);

    this.stopRecording = record({
      ...this.recordingOptions,
      emit: this.handleRecordingEmit,
    });

    this.isEnabled = true;
  }

  /**
   * We want to batch uploads of replay events. Save events only if
   * `<flushMinDelay>` milliseconds have elapsed since the last event
   * *OR* if `<flushMaxDelay>` milliseconds have elapsed.
   *
   * Accepts a callback to perform side-effects and returns true to stop batch
   * processing and hand back control to caller.
   */
  addUpdate(cb?: AddUpdateCallback) {
    const now = new Date().getTime();
    // Timestamp of the first replay event since the last flush, this gets
    // reset when we finish the replay event
    if (
      !this.initialEventTimestampSinceFlush &&
      !this.options.captureOnlyOnError
    ) {
      this.initialEventTimestampSinceFlush = now;
    }

    // We need to always run `cb` (e.g. in the case of captureOnlyOnError == true)
    const cbResult = cb?.();

    // If this option is turned on then we will only want to call `flush`
    // explicitly
    if (this.options.captureOnlyOnError) {
      return;
    }

    // If callback is true, we do not want to continue with flushing -- the
    // caller will need to handle it.
    if (cbResult === true) {
      return;
    }

    this.debouncedFlush();
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK does not support a teardown
   */
  stop() {
    logger.log('Stopping Replays');
    this.isEnabled = false;
    this.removeListeners();
    this.stopRecording?.();
    this.eventBuffer?.destroy();
    this.eventBuffer = null;
  }

  clearSession() {
    deleteSession();
    this.session = undefined;
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
      samplingRate: this.options.replaysSamplingRate,
    });

    // If session was newly created (i.e. was not loaded from storage), then
    // enable flag to create the root replay
    if (type === 'new') {
      this.newSessionCreated = true;
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
  setInitialState() {
    const urlPath = `${window.location.pathname}${window.location.hash}${window.location.search}`;
    const url = `${window.location.origin}${urlPath}`;

    this.performanceEvents = [];
    this.initialEventTimestampSinceFlush = null;

    // Reset context as well
    this.clearContext();
    this.initialState = {
      timestamp: new Date().getTime(),
      url,
    };

    this.context.urls.push(url);
  }

  /**
   * Adds listeners to record events for the replay
   */
  addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);

    // There is no way to remove these listeners, so ensure they are only added once
    if (!this.hasInitializedCoreListeners) {
      // Listeners from core SDK //
      const scope = getCurrentHub().getScope();
      scope?.addScopeListener(this.handleCoreBreadcrumbListener('scope'));
      addInstrumentationHandler(
        'dom',
        this.handleCoreBreadcrumbListener('dom')
      );
      addInstrumentationHandler('fetch', this.handleCoreSpanListener('fetch'));
      addInstrumentationHandler('xhr', this.handleCoreSpanListener('xhr'));
      addInstrumentationHandler(
        'history',
        this.handleCoreSpanListener('history')
      );

      this.hasInitializedCoreListeners = true;
    }

    // PerformanceObserver //
    if (!('PerformanceObserver' in window)) {
      return;
    }

    this.performanceObserver = new PerformanceObserver(
      this.handlePerformanceObserver
    );

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
    ].forEach((type) => {
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
  removeListeners() {
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );

    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

  /**
   * Core Sentry SDK global event handler. Attaches `replayId` to all [non-replay]
   * events as a tag. Also handles the case where we only want to capture a reply
   * when an error occurs.
   **/
  handleGlobalEvent = (event: Event) => {
    // Do not apply replayId to the root event
    if (
      // @ts-expect-error new event type
      event.type === REPLAY_EVENT_NAME
    ) {
      // Replays have separate set of breadcrumbs, do not include breadcrumbs
      // from core SDK
      delete event.breadcrumbs;
      return event;
    }

    event.tags = { ...event.tags, replayId: this.session?.id };

    if (event.type === 'transaction') {
      this.context.traceIds.add(String(event.contexts?.trace.trace_id || ''));
      return event;
    }

    // XXX: Is it safe to assume that all other events are error events?
    // @ts-expect-error: Type 'undefined' is not assignable to type 'string'.ts(2345)
    this.context.errorIds.add(event.event_id);

    // Need to be very careful that this does not cause an infinite loop
    if (
      this.options.captureOnlyOnError &&
      event.exception &&
      event.message !== UNABLE_TO_SEND_REPLAY // ignore this error because other we could loop indefinitely with trying to capture replay and failing
    ) {
      // TODO: Do we continue to record after?
      // TODO: What happens if another error happens? Do we record in the same session?
      setTimeout(() => this.flush());
    }

    return event;
  };

  /**
   * Handler for recording events.
   *
   * Adds to event buffer, and has varying flushing behaviors if the event was a checkout.
   */
  handleRecordingEmit = (event: RecordingEvent, isCheckout?: boolean) => {
    // If this is false, it means session is expired, create and a new session and wait for checkout
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(new Error('Received replay event after session expired.'));

      return;
    }

    this.addUpdate(() => {
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

      // If the full snapshot is due to an initial load, we will not have
      // a previous session ID. In this case, we want to buffer events
      // for a set amount of time before flushing. This can help avoid
      // capturing replays of users that immediately close the window.
      setTimeout(() => this.conditionalFlush(), this.options.initialFlushDelay);

      return true;
    });
  };

  /**
   * Handle when visibility of the page content changes. Opening a new tab will
   * cause the state to change to hidden because of content of current page will
   * be hidden. Likewise, moving a different window to cover the contents of the
   * page will also trigger a change to a hidden state.
   */
  handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.doChangeToForegroundTasks();
    } else {
      this.doChangeToBackgroundTasks();
    }
  };

  /**
   * Handle when page is blurred
   */
  handleWindowBlur = () => {
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
  handleWindowFocus = () => {
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
   *
   */
  handleCoreSpanListener =
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
        this.updateLastActivity();
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
  handleCoreBreadcrumbListener =
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
        this.updateLastActivity();
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
  handlePerformanceObserver = (list: PerformanceObserverEntryList) => {
    // For whatever reason the observer was returning duplicate navigation
    // entries (the other entry types were not duplicated).
    const newEntries = new Set(list.getEntries());
    this.performanceEvents = [
      ...this.performanceEvents,
      ...Array.from(newEntries),
    ];
  };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  doChangeToBackgroundTasks(breadcrumb?: Breadcrumb) {
    if (!this.session) {
      return;
    }

    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb && !isExpired) {
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
  doChangeToForegroundTasks(breadcrumb?: Breadcrumb) {
    if (!this.session) {
      return;
    }

    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (isExpired) {
      // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
      // ms, we will re-use the existing session, otherwise create a new
      // session
      logger.log('Document has become active, but session has expired');
      this.loadSession({ expiry: VISIBILITY_CHANGE_TIMEOUT });
      this.triggerFullSnapshot();
      return;
    }

    if (breadcrumb) {
      this.createCustomBreadcrumb(breadcrumb);
    }

    // Otherwise if session is not expired...
    // Update with current timestamp as the last session activity
    // Only updating session on visibility change to be conservative about
    // writing to session storage. This could be changed in the future.
    this.updateLastActivity();
  }

  /**
   * Trigger rrweb to take a full snapshot which will cause this plugin to
   * create a new Replay event.
   */
  triggerFullSnapshot() {
    logger.log('Taking full rrweb snapshot');
    record.takeFullSnapshot(true);
  }

  /**
   * Add an event to the event buffer
   */
  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    if (!this.eventBuffer) {
      // This implies that `isEnabled` is false
      return;
    }

    // TODO: sadness -- we will want to normalize timestamps to be in ms -
    // requires coordination with frontend
    const isMs = event.timestamp > 9999999999;
    const timestampInMs = isMs ? event.timestamp : event.timestamp * 1000;

    // Only record earliest event if a new session was created, otherwise it
    // shouldn't be relevant
    if (
      this.newSessionCreated &&
      (!this.context.earliestEvent ||
        timestampInMs < this.context.earliestEvent)
    ) {
      this.context.earliestEvent = timestampInMs;
    }

    this.eventBuffer.addEvent(event, isCheckout);
  }
  /**
   * Updates the session's last activity timestamp
   */
  updateLastActivity(lastActivity: number = new Date().getTime()) {
    if (this.session) {
      this.session.lastActivity = lastActivity;
    }
  }

  /**
   * Helper to create (and buffer) a replay breadcrumb from a core SDK breadcrumb
   */
  createCustomBreadcrumb(breadcrumb: Breadcrumb) {
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
  createPerformanceSpans(entries: ReplayPerformanceEntry[]) {
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
        })
      )
    );
  }

  /**
   * Observed performance events are added to `this.performanceEvents`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  addPerformanceEntries() {
    // Copy and reset entries before processing
    const entries = [...this.performanceEvents];
    this.performanceEvents = [];

    return this.createPerformanceSpans(createPerformanceEntries(entries));
  }

  /**
   * Create a "span" for the total amount of memory being used by JS objects
   * (including v8 internal objects).
   */
  addMemoryEntry() {
    // window.performance.memory is a non-standard API and doesn't work on all browsers
    // so we check before creating the event.
    if (!('memory' in window.performance)) {
      return;
    }

    return this.createPerformanceSpans([
      // @ts-expect-error memory doesn't exist on type Performance as the API is non-standard (we check that it exists above)
      createMemoryEntry(window.performance.memory),
    ]);
  }

  /**
   *
   *
   * Returns true if session is not expired, false otherwise.
   */
  checkAndHandleExpiredSession(expiry: number = SESSION_IDLE_DURATION) {
    const oldSessionId = this.session?.id;

    // This will create a new session if expired, based on expiry length
    this.loadSession({ expiry });

    // Session was expired if session ids do not match
    const isExpired = oldSessionId !== this.session?.id;

    if (!isExpired) {
      return true;
    }

    // TODO: We could potentially figure out a way to save the last session,
    // and produce a checkout based on a previous checkout + updates, and then
    // replay the event on top. Or maybe replay the event on top of a refresh
    // snapshot.

    // For now create a new snapshot
    this.triggerFullSnapshot();

    return false;
  }

  /**
   * Only flush if `captureOnlyOnError` is false.
   */
  conditionalFlush() {
    if (this.options.captureOnlyOnError) {
      return;
    }

    return this.flush();
  }

  /**
   * Clear context
   */
  clearContext() {
    this.context.errorIds.clear();
    this.context.traceIds.clear();
    this.context.urls = [];
    this.context.earliestEvent = null;
  }

  /**
   * Return and clear context
   */
  popEventContext({
    timestamp,
  }: {
    timestamp: number;
  }): Omit<
    CaptureReplayEventParams,
    'includeReplayStartTimestamp' | 'segmentId' | 'replayId'
  > {
    const initialState = this.initialState;
    if (
      this.initialState &&
      this.context.earliestEvent &&
      this.context.earliestEvent < this.initialState.timestamp
    ) {
      initialState.timestamp = this.context.earliestEvent;
    }

    const context = {
      initialState,
      timestamp,
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
   */
  async runFlush() {
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

    // NOTE: Copy values from instance members, as it's possible they could
    // change before the flush finishes.
    const replayId = this.session.id;
    const newSessionCreated = this.newSessionCreated;
    // Always increment segmentId regardless of outcome of sending replay
    const segmentId = this.session.segmentId++;

    // Reset this to null regardless of `sendReplay` result so that future
    // events will get flushed properly
    this.initialEventTimestampSinceFlush = null;

    try {
      // Note this empties the event buffer regardless of outcome of sending replay
      const recordingData = await this.eventBuffer.finish();
      await this.sendReplay(replayId, recordingData, segmentId);

      // The below will only happen after successfully sending replay //
      captureReplayEvent({
        ...this.popEventContext({ timestamp: new Date().getTime() }),
        replayId,
        segmentId,
        includeReplayStartTimestamp: newSessionCreated,
      });
      this.newSessionCreated = false;
    } catch (err) {
      captureException(err);
      console.error(err);
    }
  }

  /**
   * Flush recording data to Sentry. Creates a lock so that only a single flush
   * can be active at a time.
   */
  flush = async () => {
    if (!this.isEnabled) {
      // This is just a precaution, there should be no listeners that would
      // cause a flush.
      return;
    }

    if (!this.checkAndHandleExpiredSession()) {
      logger.error(
        new Error('Attempting to finish replay event after session expired.')
      );
      return;
    }

    if (!this.session?.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    // Since flushing, ensure other queued flushes are cancelled
    // We do this regardless of having a queued flush since the event updates
    // will be handled by queued flush
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

    // Wait for previous flush to finish, then call a throttled
    // `flush()`. It's throttled because other flush
    // requests could be queued waiting for it to resolve. We want to reduce
    // all outstanding requests (as well as any new flush requests that occur
    // within a second of the locked flush completing) into a single flush.
    try {
      await this.flushLock;
    } catch (err) {
      console.error(err);
    } finally {
      this.throttledFlush();
    }
  };

  /**
   * A throttled `flush()` that is called after a flush is completed and there
   * are other queued flushes.
   *
   * Instead of calling a flush for every <n> queued flush, condense it to a single call
   */
  throttledFlush = throttle(this.flush, 1000, {
    leading: false,
    trailing: true,
  });

  /**
   * Send replay attachment using `fetch()`
   */
  async sendReplayRequest({
    endpoint,
    events,
    replayId: event_id,
    segmentId: segment_id,
  }: ReplayRequest) {
    const payloadWithSequence = createPayload({
      events,
      headers: {
        segment_id,
      },
    });

    const envelope = createEnvelope(
      {
        event_id,
        sent_at: new Date().toISOString(),
        sdk: {
          name: 'sentry.javascript.integration.replay',
          version: __SENTRY_REPLAY_VERSION__,
        },
      },
      [
        [
          {
            // @ts-expect-error setting envelope
            type: 'replay_recording',
            length: payloadWithSequence.length,
          },
          // @ts-expect-error: Type 'string' is not assignable to type 'ClientReport'.ts(2322)
          payloadWithSequence,
        ],
      ]
    );

    // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads
    logger.log(`uploading attachment via fetch()`);
    const response = await fetch(endpoint, {
      method: 'POST',
      body: serializeEnvelope(envelope),
    });

    if (response.status !== 200) {
      setContext('Send Replay Response', {
        status: response.status,
        body: await response.text(),
      });
      throw new Error(UNABLE_TO_SEND_REPLAY);
    }
  }

  resetRetries() {
    this.retryCount = 0;
    this.retryInterval = BASE_RETRY_INTERVAL;
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  async sendReplay(
    replayId: string,
    events: RecordedEvents,
    segmentId: number
  ) {
    // short circuit if there's no events to upload
    if (!events.length) {
      return;
    }

    const client = getCurrentHub().getClient();
    // @ts-expect-error: Type 'undefined' is not assignable to type 'DsnComponents'.ts(2345)
    const endpoint = getEnvelopeEndpointWithUrlEncodedAuth(client.getDsn());

    try {
      await this.sendReplayRequest({
        endpoint,
        events,
        replayId,
        segmentId,
      });
      this.resetRetries();
      return true;
    } catch (ex) {
      console.error(ex);
      // Capture error for every failed replay
      // TODO: Remove this before GA as this will create an error on customer's project
      setContext('Replays', {
        retryCount: this.retryCount,
      });

      captureException(new Error(UNABLE_TO_SEND_REPLAY));

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
            await this.sendReplay(replayId, events, segmentId);
            resolve(true);
          } catch (err) {
            reject(err);
          }
        }, this.retryInterval);
      });
    }
  }
}
