import {
  addGlobalEventProcessor,
  captureEvent,
  getCurrentHub,
} from '@sentry/core';
import { addInstrumentationHandler, uuid4 } from '@sentry/utils';
import { DsnComponents, Event, Integration, Breadcrumb } from '@sentry/types';

import { EventType, record } from 'rrweb';

import {
  createPerformanceEntries,
  createMemoryEntry,
  ReplayPerformanceEntry,
} from './createPerformanceEntry';
import { createEventBuffer, IEventBuffer } from './eventBuffer';
import {
  REPLAY_EVENT_NAME,
  ROOT_REPLAY_NAME,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { getSession } from './session/getSession';
import type {
  RRWebEvent,
  RRWebOptions,
  ReplaySpan,
  ReplayRequest,
  InstrumentationType,
  SentryReplayPluginOptions,
  SentryReplayConfiguration,
} from './types';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';
import { handleDom, handleScope, handleFetch, handleXhr } from './coreHandlers';
import createBreadcrumb from './util/createBreadcrumb';
import { Session } from './session/Session';
import { captureReplay } from './api/captureReplay';

/**
 * Returns true if we want to flush immediately, otherwise continue with normal batching
 */
type AddUpdateCallback = () => boolean | void;

const BASE_RETRY_INTERVAL = 5000;
const MAX_RETRY_COUNT = 5;

export class SentryReplay implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string = SentryReplay.id;

  public eventBuffer: IEventBuffer;

  /**
   * Buffer of breadcrumbs to be uploaded
   */
  public breadcrumbs: Breadcrumb[] = [];

  /**
   * Buffer of replay spans to be uploaded
   */
  public replaySpans: ReplaySpan[] = [];

  /**
   * List of PerformanceEntry from PerformanceObserver
   */
  public performanceEvents: PerformanceEntry[] = [];

  /**
   * Options to pass to `rrweb.record()`
   */
  readonly rrwebRecordOptions: RRWebOptions;

  readonly options: SentryReplayPluginOptions;

  /**
   * setTimeout id used for debouncing sending rrweb attachments
   */
  private timeout: number;

  /**
   * The timestamp of the first event since the last flush.
   * This is used to determine if the maximum allowed time has passed before we should flush events again.
   */
  private initialEventTimestampSinceFlush: number | null = null;

  private performanceObserver: PerformanceObserver | null = null;

  private retryCount = 0;
  private retryInterval = BASE_RETRY_INTERVAL;

  /**
   * Flag to make sure we only create a replay event when
   * necessary (i.e. we only want to have a single replay
   * event per session and it should only be created
   * immediately before sending recording)
   */
  private needsCaptureReplay = false;

  session: Session | undefined;

  static attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
    const { host, projectId, protocol, publicKey } = dsn;

    const port = dsn.port !== '' ? `:${dsn.port}` : '';
    const path = dsn.path !== '' ? `/${dsn.path}` : '';

    return `${protocol}://${host}${port}${path}/api/${projectId}/events/${eventId}/attachments/?sentry_key=${publicKey}&sentry_version=7&sentry_client=replay`;
  }

  constructor({
    uploadMinDelay = 5000,
    uploadMaxDelay = 15000,
    stickySession = false, // TBD: Making this opt-in for now
    useCompression = true,
    rrwebConfig: {
      maskAllInputs = true,
      blockClass = 'sr-block',
      ignoreClass = 'sr-ignore',
      maskTextClass = 'sr-mask',
      ...rrwebRecordOptions
    } = {},
  }: SentryReplayConfiguration = {}) {
    this.rrwebRecordOptions = {
      maskAllInputs,
      blockClass,
      ignoreClass,
      maskTextClass,
      ...rrwebRecordOptions,
    };

    this.options = { uploadMinDelay, uploadMaxDelay, stickySession };
    this.eventBuffer = createEventBuffer({ useCompression });
  }

  setupOnce() {
    /**
     * Because we create a transaction in `setupOnce`, we can potentially create a
     * transaction before some native SDK integrations have run and applied their
     * own global event processor. An example is:
     * https://github.com/getsentry/sentry-javascript/blob/b47ceafbdac7f8b99093ce6023726ad4687edc48/packages/browser/src/integrations/useragent.ts
     *
     * So we do this as a workaround to wait for other global event processors to finish
     */
    window.setTimeout(() => this.setup());
  }

  setup() {
    this.loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      throw new Error('Invalid session');
    }

    this.addListeners();

    // Tag all (non replay) events that get sent to Sentry with the current
    // replay ID so that we can reference them later in the UI
    addGlobalEventProcessor((event: Event) => {
      // Do not apply replayId to the root event
      if (event.message === ROOT_REPLAY_NAME) {
        return event;
      }

      event.tags = { ...event.tags, replayId: this.session.id };
      return event;
    });

    record({
      ...this.rrwebRecordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        // If this is false, it means session is expired, create and a new session and wait for checkout
        if (!this.checkAndHandleExpiredSession()) {
          logger.error(
            new Error('Received replay event after session expired.')
          );

          return;
        }

        this.addUpdate(() => {
          // We need to clear existing events on a checkout, otherwise they are
          // incremental event updates and should be appended
          this.eventBuffer.addEvent(event, isCheckout);

          // This event type is a fullsnapshot, we should save immediately when this occurs
          // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
          if (event.type === 2) {
            // A fullsnapshot happens on initial load and if we need to start a
            // new replay due to idle timeout. In the latter case, a new session *should* have been started
            // before triggering a new checkout
            return true;
          }

          return false;
        });
      },
    });
  }

  /**
   * We want to batch uploads of replay events. Save events only if
   * `<uploadMinDelay>` milliseconds have elapsed since the last event
   * *OR* if `<uploadMaxDelay>` milliseconds have elapsed.
   *
   * Accepts a callback to perform side-effects and returns a boolean value if we
   * should flush events immediately
   */
  addUpdate(cb?: AddUpdateCallback) {
    const now = new Date().getTime();

    // Timestamp of the first replay event since the last flush, this gets
    // reset when we finish the replay event
    if (!this.initialEventTimestampSinceFlush) {
      this.initialEventTimestampSinceFlush = now;
    }

    // Do not finish the replay event if we receive a new replay event
    if (this.timeout) {
      window.clearTimeout(this.timeout);
    }

    if (cb?.() === true) {
      this.flushUpdate();
      return;
    }

    const uploadMaxDelayExceeded = isExpired(
      this.initialEventTimestampSinceFlush,
      this.options.uploadMaxDelay,
      now
    );

    // If `uploadMaxDelayExceeded` is true, then we should finish the replay event immediately,
    // Otherwise schedule it to be finished in `this.options.uploadMinDelay`
    if (uploadMaxDelayExceeded) {
      logger.log('replay max delay exceeded, finishing replay event');
      this.flushUpdate();
      return;
    }

    // Set timer to finish replay event and send replay attachment to
    // Sentry. Will be cancelled if an event happens before `uploadMinDelay`
    // elapses.
    this.timeout = window.setTimeout(() => {
      logger.log('replay timeout exceeded, finishing replay event');
      this.flushUpdate(now);
    }, this.options.uploadMinDelay);
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK does not support a teardown
   */
  destroy() {
    this.removeListeners();
    this.eventBuffer.destroy();
  }

  clearSession() {
    this.session = null;
  }

  /**
   * Loads a session from storage, or creates a new one if it does not exist or
   * is expired.
   */
  loadSession({ expiry }: { expiry: number }): void {
    const { type, session } = getSession({
      expiry,
      stickySession: this.options.stickySession,
      currentSession: this.session,
    });

    // If session was newly created (i.e. was not loaded from storage), then
    // enable flag to create the root replay
    if (type === 'new') {
      this.needsCaptureReplay = true;
    }

    this.session = session;
  }

  addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
    window.addEventListener('beforeunload', this.handleWindowUnload);

    // Listeners from core SDK //
    const scope = getCurrentHub().getScope();
    scope.addScopeListener(this.handleCoreListener('scope'));
    addInstrumentationHandler('dom', this.handleCoreListener('dom'));

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
    ].forEach((type) =>
      this.performanceObserver.observe({
        type,
        buffered: true,
      })
    );
  }

  removeListeners() {
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );

    document.removeEventListener('beforeunload', this.handleWindowUnload);

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

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

    this.doChangeToBackgroundTasks(breadcrumb);
  };

  /**
   * Handle when page is focused
   */
  handleWindowFocus = () => {
    const breadcrumb = createBreadcrumb({
      category: 'ui.focus',
    });

    this.doChangeToForegroundTasks(breadcrumb);
  };

  handleWindowUnload = () => {
    this.createCustomBreadcrumb(
      createBreadcrumb({
        category: 'ui.exit',
      })
    );
  };

  handleCoreListener = (type: InstrumentationType) => (handlerData: any) => {
    const handlerMap: Record<
      InstrumentationType,
      [
        handler: InstrumentationType extends 'fetch' | 'xhr'
          ? (handlerData: any) => ReplaySpan
          : (handlerData: any) => Breadcrumb,
        eventType: string
      ]
    > = {
      scope: [handleScope, 'breadcrumb'],
      dom: [handleDom, 'breadcrumb'],
      fetch: [handleFetch, 'span'],
      xhr: [handleXhr, 'span'],
    };

    if (!(type in handlerMap)) {
      throw new Error(`No handler defined for type: ${type}`);
    }

    const [handlerFn, eventType] = handlerMap[type];

    const result = handlerFn(handlerData);

    if (result === null) {
      return;
    }

    if (['sentry.transaction'].includes(result.category)) {
      return;
    }

    this.addUpdate(() => {
      this.eventBuffer.addEvent({
        type: EventType.Custom,
        // TODO: We were converting from ms to seconds for breadcrumbs, spans,
        // but maybe we should just keep them as milliseconds
        timestamp:
          (result as Breadcrumb).timestamp * 1000 ||
          (result as ReplaySpan).startTimestamp * 1000,
        data: {
          tag: eventType,
          payload: result,
        },
      });
    });
  };

  /**
   * Keep a list of performance entries that will be sent with a replay
   */
  handlePerformanceObserver = (
    list: PerformanceObserverEntryList
    // observer: PerformanceObserver
  ) => {
    this.performanceEvents = [...this.performanceEvents, ...list.getEntries()];
  };

  /**
   * Tasks to run when we consider a page to be hidden (via blurring and/or visibility)
   */
  doChangeToBackgroundTasks(breadcrumb?: Breadcrumb) {
    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb) {
      this.createCustomBreadcrumb({
        ...breadcrumb,
        // if somehow the page went hidden while session is expired, attach to previous session
        timestamp: isExpired
          ? this.session.lastActivity / 1000
          : breadcrumb.timestamp,
      });
    }

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    this.flushUpdate();
  }

  /**
   * Tasks to run when we consider a page to be visible (via focus and/or visibility)
   */
  doChangeToForegroundTasks(breadcrumb?: Breadcrumb) {
    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (breadcrumb) {
      this.createCustomBreadcrumb({
        ...breadcrumb,
        timestamp: isExpired
          ? new Date().getTime() / 1000
          : breadcrumb.timestamp,
      });
    }

    if (isExpired) {
      // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
      // ms, we will re-use the existing session, otherwise create a new
      // session
      logger.log('Document has become active, but session has expired');
      this.loadSession({ expiry: VISIBILITY_CHANGE_TIMEOUT });
      this.triggerFullSnapshot();
      return;
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

  updateLastActivity(lastActivity: number = new Date().getTime()) {
    this.session.lastActivity = lastActivity;
  }

  createCustomBreadcrumb(breadcrumb: Breadcrumb) {
    this.addUpdate(() => {
      this.eventBuffer.addEvent({
        type: EventType.Custom,
        timestamp: breadcrumb.timestamp,
        data: {
          tag: 'breadcrumb',
          payload: breadcrumb,
        },
      });
    });
  }

  /**
   * Create a span for each performance entry. The parent transaction is `this.replayEvent`.
   */
  createPerformanceSpans(entries: ReplayPerformanceEntry[]) {
    entries.forEach(({ type, start, end, name, data }) => {
      this.eventBuffer.addEvent({
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
      });
    });
  }

  /**
   * Observed performance events are added to `this.performanceEvents`. These
   * are included in the replay event before it is finished and sent to Sentry.
   */
  addPerformanceEntries() {
    // Copy and reset entries before processing
    const entries = [...this.performanceEvents];
    this.performanceEvents = [];

    // Parse the entries
    const entryEvents = createPerformanceEntries(entries);

    // window.performance.memory is a non-standard API and doesn't work on all browsers
    // so we check before creating the event.
    if ('memory' in window.performance) {
      // @ts-expect-error memory doesn't exist on type Performance as the API is non-standard
      entryEvents.push(createMemoryEntry(window.performance.memory));
    }
    this.createPerformanceSpans(entryEvents);
  }

  /**
   *
   *
   * Returns true if session is not expired, false otherwise.
   */
  checkAndHandleExpiredSession(expiry: number = SESSION_IDLE_DURATION) {
    const oldSessionId = this.session.id;

    // This will create a new session if expired, based on expiry length
    this.loadSession({ expiry });

    // Session was expired if session ids do not match
    const isExpired = oldSessionId !== this.session.id;

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

  async flushUpdate(lastActivity?: number) {
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(
        new Error('Attempting to finish replay event after session expired.')
      );
    }

    if (!this.session.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    this.addPerformanceEntries();

    if (!this.eventBuffer.length) {
      return;
    }

    // Only want to create replay event if session is new
    if (this.needsCaptureReplay) {
      // This event needs to exist before calling `sendReplay`
      captureReplay(this.session);
      this.needsCaptureReplay = false;
    }

    // Reset this to null regardless of `sendReplay` result so that future
    // events will get flushed properly
    this.initialEventTimestampSinceFlush = null;

    try {
      const recordingData = await this.eventBuffer.finish();
      await this.sendReplay(this.session.id, recordingData);
      // The below will only happen after successfully sending replay //

      // TBD: Alternatively we could update this after every rrweb event
      this.updateLastActivity(lastActivity);

      captureEvent({
        message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
        tags: {
          replayId: this.session.id,
          sequenceId: this.session.sequenceId++,
        },
      });
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Determine if there is browser support for `navigator.sendBeacon`
   */
  hasSendBeacon() {
    return 'navigator' in window && 'sendBeacon' in window.navigator;
  }

  /**
   * Send replay attachment using either `sendBeacon()` or `fetch()`
   */
  async sendReplayRequest({ endpoint, events }: ReplayRequest) {
    const formData = new FormData();
    const payloadBlob = new Blob([events], {
      type: 'application/json',
    });

    logger.log('blob size in bytes: ', payloadBlob.size);

    formData.append('rrweb', payloadBlob, `rrweb-${new Date().getTime()}.json`);

    // If sendBeacon is supported and payload is smol enough...
    if (this.hasSendBeacon() && payloadBlob.size <= 65535) {
      logger.log(`uploading attachment via sendBeacon()`);
      window.navigator.sendBeacon(endpoint, formData);
      return;
    }

    // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads
    logger.log(`uploading attachment via fetch()`);
    await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  resetRetries() {
    this.retryCount = 0;
    this.retryInterval = BASE_RETRY_INTERVAL;
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  async sendReplay(eventId: string, events: Uint8Array | string) {
    // short circuit if there's no events to upload
    if (!events.length) {
      return;
    }

    const client = getCurrentHub().getClient();
    const endpoint = SentryReplay.attachmentUrlFromDsn(
      client.getDsn(),
      eventId
    );

    try {
      await this.sendReplayRequest({
        endpoint,
        events,
      });
      this.resetRetries();
      return true;
    } catch (ex) {
      // we have to catch this otherwise it throws an infinite loop in Sentry
      console.error(ex);

      // If an error happened here, it's likely that uploading the attachment
      // failed, we'll can retry with the same events payload
      if (this.retryCount >= MAX_RETRY_COUNT) {
        this.resetRetries();
        return false;
      }

      this.retryCount = this.retryCount + 1;
      // will retry in intervals of 5, 10, 15, 20, 25 seconds
      this.retryInterval = this.retryCount * this.retryInterval;
      try {
        await new Promise((resolve, reject) => {
          setTimeout(async () => {
            const result = await this.sendReplay(eventId, events);

            if (result) {
              resolve(true);
            } else {
              reject(new Error('Could not send replay'));
            }
          }, this.retryInterval);
        });

        return true;
      } catch {
        return false;
      }
    }
  }
}
