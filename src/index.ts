import * as Sentry from '@sentry/browser';
import { uuid4 } from '@sentry/utils';
import { DsnComponents, Event, Integration, Breadcrumb } from '@sentry/types';

import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';
import {
  createPerformanceEntries,
  createMemoryEntry,
  ReplayPerformanceEntry,
} from './createPerformanceEntry';
import { ReplaySession } from './session';
import {
  REPLAY_EVENT_NAME,
  ROOT_REPLAY_NAME,
  SESSION_IDLE_DURATION,
  VISIBILITY_CHANGE_TIMEOUT,
} from './session/constants';
import { getSession } from './session/getSession';
import { updateSessionActivity } from './session/updateSessionActivity';
import { ReplaySpan } from './types';
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';
import { captureEvent } from '@sentry/browser';
import addInstrumentationListeners from './addInstrumentationListeners';

type RRWebEvent = eventWithTime;
type RRWebOptions = Parameters<typeof record>[0];
interface PluginOptions {
  /**
   * The amount of time to wait before sending a replay
   */
  uploadMinDelay?: number;

  /**
   * The max amount of time to wait before sending a replay
   */
  uploadMaxDelay?: number;

  /**
   * If false, will create a new session per pageload
   */
  stickySession?: boolean;
}

interface SentryReplayConfiguration extends PluginOptions {
  /**
   * Options for `rrweb.recordsetup
   */
  rrwebConfig?: RRWebOptions;
}

interface ReplayRequest {
  endpoint: string;
  events: RRWebEvent[];
  replaySpans: ReplaySpan[];
  breadcrumbs: Breadcrumb[];
}

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

  /**
   * Buffer of rrweb events that will be serialized as JSON and saved as an attachment to a Sentry event
   */
  public events: RRWebEvent[] = [];

  public performanceEvents: PerformanceEntry[] = [];

  /**
   * Options to pass to `rrweb.record()`
   */
  readonly rrwebRecordOptions: RRWebOptions;

  readonly options: PluginOptions;

  /**
   * setTimeout id used for debouncing sending rrweb attachments
   */
  private timeout: number;

  private breadcrumbs: Breadcrumb[] = [];

  /**
   * The timestamp of the first event since the last flush.
   * This is used to determine if the maximum allowed time has passed before we should flush events again.
   */
  private initialEventTimestampSinceFlush: number | null = null;
  public replaySpans: ReplaySpan[] = [];

  private performanceObserver: PerformanceObserver | null = null;

  private retryCount = 0;
  private retryInterval = BASE_RETRY_INTERVAL;

  session: ReplaySession | undefined;

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
    this.events = [];
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
    const hub = Sentry.getCurrentHub();
    const scope = hub.getScope();

    addInstrumentationListeners(scope, this);

    this.loadSession({ expiry: SESSION_IDLE_DURATION });

    // If there is no session, then something bad has happened - can't continue
    if (!this.session) {
      throw new Error('Invalid session');
    }

    // Tag all (non replay) events that get sent to Sentry with the current
    // replay ID so that we can reference them later in the UI
    Sentry.addGlobalEventProcessor((event: Event) => {
      // Do not apply replayId to the root transaction
      if (event.transaction === ROOT_REPLAY_NAME) {
        return event;
      }

      event.tags = { ...event.tags, replayId: this.session.id };
      return event;
    });

    record({
      ...this.rrwebRecordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        // We want to batch uploads of replay events. Save events only if
        // `<uploadMinDelay>` milliseconds have elapsed since the last event
        // *OR* if `<uploadMaxDelay>` milliseconds have elapsed.

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

        // If this is false, it means session is expired, create and a new session and wait for checkout
        if (!this.checkAndHandleExpiredSession()) {
          logger.error(
            new Error('Received replay event after session expired.')
          );

          return;
        }

        // We need to clear existing events on a checkout, otherwise they are
        // incremental event updates and should be appended
        if (isCheckout) {
          this.events = [event];
        } else {
          this.events.push(event);
        }

        // This event type is a fullsnapshot, we should save immediately when this occurs
        // See https://github.com/rrweb-io/rrweb/blob/d8f9290ca496712aa1e7d472549480c4e7876594/packages/rrweb/src/types.ts#L16
        if (event.type === 2) {
          // A fullsnapshot happens on initial load and if we need to start a
          // new replay due to idle timeout. In the latter case, a new session *should* have been started
          // before triggering a new checkout
          this.finishReplayEvent();
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
          this.finishReplayEvent();
          return;
        }

        // Set timer to finish replay event and send replay attachment to
        // Sentry. Will be cancelled if an event happens before `uploadMinDelay`
        // elapses.
        this.timeout = window.setTimeout(() => {
          logger.log('replay timeout exceeded, finishing replay event');
          this.finishReplayEvent();
        }, this.options.uploadMinDelay);
      },
    });

    this.addListeners();
  }

  /**
   * Currently, this needs to be manually called (e.g. for tests). Sentry SDK does not support a teardown
   */
  teardown() {
    this.removeListeners();
  }

  clearSession() {
    this.session = null;
  }

  /**
   * Loads a session from storage, or creates a new one
   */
  loadSession({ expiry }: { expiry: number }): void {
    this.session = getSession({
      expiry,
      stickySession: this.options.stickySession,
      currentSession: this.session,
    });
  }

  updateSession(session: Partial<ReplaySession>) {
    this.session = {
      ...this.session,
      ...session,
    };
  }

  addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

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

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
  }

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
   * Handle when visibility of the page changes. (e.g. new tab is opened)
   */
  handleVisibilityChange = () => {
    const isExpired = isSessionExpired(this.session, VISIBILITY_CHANGE_TIMEOUT);

    if (isExpired) {
      if (document.visibilityState === 'visible') {
        // If the user has come back to the page within VISIBILITY_CHANGE_TIMEOUT
        // ms, we will re-use the existing session, otherwise create a new
        // session
        logger.log('Document has become active, but session has expired');
        this.loadSession({ expiry: VISIBILITY_CHANGE_TIMEOUT });
        this.triggerFullSnapshot();
      }
      // We definitely want to return if visibilityState is "visible", and I
      // think we also want to do the same when "hidden", as there shouldn't be
      // any action to take if user has gone idle for a long period and then
      // comes back to hide the tab. We don't trigger a full snapshot because
      // we don't want to start a new session as they immediately have hidden
      // the tab.
      return;
    }

    // Otherwise if session is not expired...

    // Update with current timestamp as the last session activity
    // Only updating session on visibility change to be conservative about
    // writing to session storage. This could be changed in the future.
    this.updateSession(
      updateSessionActivity({
        stickySession: this.options.stickySession,
      })
    );

    // Send replay when the page/tab becomes hidden. There is no reason to send
    // replay if it becomes visible, since no actions we care about were done
    // while it was hidden
    if (document.visibilityState !== 'visible') {
      this.finishReplayEvent();
    }
  };

  /**
   * Trigger rrweb to take a full snapshot which will cause this plugin to
   * create a new Replay event.
   */
  triggerFullSnapshot() {
    logger.log('Taking full rrweb snapshot');
    record.takeFullSnapshot(true);
  }

  /**
   * Create a span for each performance entry. The parent transaction is `this.replayEvent`.
   */
  createPerformanceSpans(entries: ReplayPerformanceEntry[]) {
    entries.forEach(({ type, start, end, name, data }) => {
      this.replaySpans.push({
        op: type,
        description: name,
        startTimestamp: start,
        endTimestamp: end,
        data,
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
    // if (!this.options.stickySession) {
    // return;
    // }

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

  finishReplayEvent() {
    if (!this.checkAndHandleExpiredSession()) {
      logger.error(
        new Error('Attempting to finish replay event after session expired.')
      );
    }

    if (!this.session.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }
    // TEMP: keep sending a replay event just for the duration
    captureEvent({
      message: `${REPLAY_EVENT_NAME}-${uuid4().substring(16)}`,
      tags: {
        replayId: this.session.id,
        sequenceId: this.session.sequenceId++,
      },
    });

    this.addPerformanceEntries();
    this.sendReplay(this.session.id);

    this.initialEventTimestampSinceFlush = null;
    // TBD: Alternatively we could update this after every rrweb event
    this.session.lastActivity = new Date().getTime();
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
  async sendReplayRequest({
    endpoint,
    events,
    replaySpans,
    breadcrumbs,
  }: ReplayRequest) {
    const stringifiedPayload = JSON.stringify({
      recording: events,
      replaySpans: replaySpans,
      breadcrumbs: breadcrumbs,
    });
    const formData = new FormData();
    formData.append(
      'rrweb',
      new Blob([stringifiedPayload], {
        type: 'application/json',
      }),
      `rrweb-${new Date().getTime()}.json`
    );

    // If sendBeacon is supported and payload is smol enough...
    if (this.hasSendBeacon() && stringifiedPayload.length <= 65536) {
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
  async sendReplay(eventId: string) {
    // short circuit if theres no events to replay
    if (!this.events.length) return;

    // Make a copy of the events array reference and immediately clear the
    // events member so that we do not lose new events while uploading
    // attachment.
    const events = this.events;
    const replaySpans = this.replaySpans;
    const breadcrumbs = this.breadcrumbs;
    this.replaySpans = [];
    this.breadcrumbs = [];
    this.events = [];

    const client = Sentry.getCurrentHub().getClient();
    const endpoint = SentryReplay.attachmentUrlFromDsn(
      client.getDsn(),
      eventId
    );

    try {
      await this.sendReplayRequest({
        endpoint,
        events,
        replaySpans,
        breadcrumbs,
      });
      this.resetRetries();
      return true;
    } catch (ex) {
      // we have to catch this otherwise it throws an infinite loop in Sentry
      console.error(ex);
      // If an error happened here, it's likely that uploading the attachment failed, we'll want to restore the events that failed to upload
      this.events = [...events, ...this.events];
      this.replaySpans = [...replaySpans, ...this.replaySpans];
      this.breadcrumbs = [...replaySpans, ...this.breadcrumbs];

      if (this.retryCount >= MAX_RETRY_COUNT) {
        this.resetRetries();
      } else {
        this.retryCount = this.retryCount + 1;
        // will retry in intervals of 5, 10, 15, 20, 25 seconds
        this.retryInterval = this.retryCount * this.retryInterval;
        setTimeout(() => this.sendReplay(eventId), this.retryInterval);
      }
      return false;
    }
  }
}
