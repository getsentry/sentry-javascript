import * as Sentry from '@sentry/browser';
import { DsnComponents, Event, Scope, Transaction } from '@sentry/types';

import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';
import {
  createPerformanceEntries,
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
import { isExpired } from './util/isExpired';
import { isSessionExpired } from './util/isSessionExpired';
import { logger } from './util/logger';

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
   * Options for `rrweb.record`
   */
  rrwebConfig?: RRWebOptions;
}

export class SentryReplay {
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
   * A Sentry Transaction that should capture every incremental rrweb update,
   * but *not* the attachments themselves. This is currently used to capture
   * breadcrumbs and maybe other spans (e.g. network requests)
   */
  private replayEvent: Transaction | undefined;

  /**
   * Options to pass to `rrweb.record()`
   */
  private readonly rrwebRecordOptions: RRWebOptions;

  private readonly options: PluginOptions;

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

  private session: ReplaySession | undefined;

  private static attachmentUrlFromDsn(dsn: DsnComponents, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=replay`;
  }

  /**
   * Get integration's instance on the current hub
   */
  private get instance() {
    return Sentry.getCurrentHub().getIntegration(SentryReplay);
  }

  public constructor({
    uploadMinDelay = 5000,
    uploadMaxDelay = 15000,
    stickySession = false, // TBD: Making this opt-in for now
    rrwebConfig: { maskAllInputs = true, ...rrwebRecordOptions } = {},
  }: SentryReplayConfiguration = {}) {
    this.rrwebRecordOptions = {
      maskAllInputs,
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

        const uploadMaxDelayExceeded = isExpired(
          this.initialEventTimestampSinceFlush,
          this.options.uploadMaxDelay,
          now
        );

        // Do not finish the replay event if we receive a new replay event
        // unless `<uploadMaxDelay>` ms have elapsed since the last time we
        // finished the replay
        if (this.timeout && !uploadMaxDelayExceeded) {
          window.clearTimeout(this.timeout);
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
          // new replay due to idle timeout. In the later case we will need to
          // create a new session before finishing the replay.
          this.loadSession({ expiry: SESSION_IDLE_DURATION });
          this.finishReplayEvent();
          return;
        }

        // Set timer to finish replay event and send replay attachment to
        // Sentry. Will be cancelled if an event happens before `uploadMinDelay`
        // elapses.
        this.timeout = window.setTimeout(() => {
          logger.log('rrweb timeout hit, finishing replay event');
          this.finishReplayEvent();
        }, this.options.uploadMinDelay);
      },
    });

    this.addListeners();

    // XXX: this needs to be in `setupOnce` vs `constructor`, otherwise SDK is
    // not fully initialized and the event will not get properly sent to Sentry
    this.createReplayEvent();
  }

  /**
   * Loads a session from storage, or creates a new one
   */
  loadSession({ expiry }: { expiry: number }): void {
    this.session = getSession({
      expiry,
      stickySession: this.options.stickySession,
    });
  }

  addListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver(
        this.handlePerformanceObserver
      );

      // Observe everything for now
      this.performanceObserver.observe({
        entryTypes: [...PerformanceObserver.supportedEntryTypes],
      });
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
    updateSessionActivity({
      stickySession: this.options.stickySession,
    });

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
   * This is our pseudo replay event disguised as a transaction. It will be
   * used to store performance entries and breadcrumbs for every incremental
   * replay event.
   **/
  createReplayEvent() {
    logger.log('CreateReplayEvent rootReplayId', this.session.id);
    this.replayEvent = Sentry.startTransaction({
      name: REPLAY_EVENT_NAME,
      parentSpanId: this.session.spanId,
      traceId: this.session.traceId,
      tags: {
        replayId: this.session.id,
      },
    });
    Sentry.configureScope((scope: Scope) => scope.setSpan(this.replayEvent));
    return this.replayEvent;
  }

  /**
   * Create a span for each performance entry. The parent transaction is `this.replayEvent`.
   */
  createPerformanceSpans(entries: ReplayPerformanceEntry[]) {
    entries.forEach(({ type, start, end, name, data }) => {
      const span = this.replayEvent?.startChild({
        op: type,
        description: name,
        startTimestamp: start,
        data,
      });
      span.finish(end);
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

    // This current implementation is to create spans on the transaction referenced in `this.replayEvent`
    this.createPerformanceSpans(entryEvents);
  }

  finishReplayEvent() {
    // if (!this.instance) return;

    // Ensure that our existing session has not expired
    const isExpired = isSessionExpired(this.session, SESSION_IDLE_DURATION);

    if (isExpired) {
      // TBD: If it is expired, we do not send any events...we could send to
      // the expired session, but not sure if that's great
      console.error(
        new Error('Attempting to finish replay event after session expired.')
      );
      return;
    }

    if (!this.session.id) {
      console.error(new Error('[Sentry]: No transaction, no replay'));
      return;
    }

    this.sendReplay(this.session.id);
    this.initialEventTimestampSinceFlush = null;
    // TBD: Alternatively we could update this after every rrweb event
    this.session.lastActivity = new Date().getTime();

    // include performance entries
    this.addPerformanceEntries();

    // Close out existing replay event and create a new one
    this.replayEvent?.setStatus('ok').finish();
    this.createReplayEvent();
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
  async sendReplayRequest(endpoint: string, events: RRWebEvent[]) {
    const stringifiedPayload = JSON.stringify({ events });
    const formData = new FormData();
    formData.append(
      'rrweb',
      new Blob([stringifiedPayload], {
        type: 'application/json',
      }),
      `rrweb-${new Date().getTime()}.json`
    );

    console.log('sendReplayRequest: ', endpoint);

    // If sendBeacon is supported and payload is smol enough...
    if (this.hasSendBeacon() && stringifiedPayload.length <= 65536) {
      logger.log(`uploading attachment via sendBeacon()`);
      window.navigator.sendBeacon(endpoint, formData);
      return;
    }

    try {
      logger.log(`uploading attachment via fetch()`);
      // Otherwise use `fetch`, which *WILL* get cancelled on page reloads/unloads
      await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
    } catch (ex) {
      // we have to catch this otherwise it throws an infinite loop in Sentry
      console.error(ex);
    }
  }

  /**
   * Finalize and send the current replay event to Sentry
   */
  async sendReplay(eventId: string) {
    // if (!this.instance) return;

    try {
      // short circuit if theres no events to replay
      if (!this.events.length) return;

      const client = Sentry.getCurrentHub().getClient();
      const endpoint = SentryReplay.attachmentUrlFromDsn(
        client.getDsn(),
        eventId
      );

      await this.sendReplayRequest(endpoint, this.events);
      this.events = [];
      return true;
    } catch (ex) {
      console.error(ex);
      return false;
    }
  }
}
