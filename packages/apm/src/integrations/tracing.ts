import { Event, EventProcessor, Hub, Integration, Span, SpanContext, SpanStatus } from '@sentry/types';
import {
  addInstrumentationHandler,
  getGlobalObject,
  isMatchingPattern,
  logger,
  supportsNativeFetch,
} from '@sentry/utils';

import { Span as SpanClass } from '../span';

/**
 * Options for Tracing integration
 */
interface TracingOptions {
  /**
   * List of strings / regex where the integration should create Spans out of. Additionally this will be used
   * to define which outgoing requests the `sentry-trace` header will be attached to.
   *
   * Default: ['localhost', /^\//]
   */
  tracingOrigins: Array<string | RegExp>;
  /**
   * Flag to disable patching all together for fetch requests.
   *
   * Default: true
   */
  traceFetch: boolean;
  /**
   * Flag to disable patching all together for xhr requests.
   *
   * Default: true
   */
  traceXHR: boolean;
  /**
   * This function will be called before creating a span for a request with the given url.
   * Return false if you don't want a span for the given url.
   *
   * By default it uses the `tracingOrigins` options as a url match.
   */
  shouldCreateSpanForRequest(url: string): boolean;
  /**
   * The time to wait in ms until the transaction will be finished. The transaction will use the end timestamp of
   * the last finished span as the endtime for the transaction.
   * Time is in ms.
   *
   * Default: 500
   */
  idleTimeout: number;
  /**
   * Flag to enable/disable creation of `navigation` transaction on history changes. Useful for react applications with
   * a router.
   *
   * Default: true
   */
  startTransactionOnLocationChange: boolean;
  /**
   * Sample to determine if the Integration should instrument anything. The decision will be taken once per load
   * on initalization.
   * 0 = 0% chance of instrumenting
   * 1 = 100% change of instrumenting
   *
   * Default: 1
   */
  tracesSampleRate: number;

  /**
   * The maximum duration of a transaction before it will be discarded. This is for some edge cases where a browser
   * completely freezes the JS state and picks it up later (background tabs).
   * So after this duration, the SDK will not send the event.
   * If you want to have an unlimited duration set it to 0.
   * Time is in seconds.
   *
   * Default: 600
   */
  maxTransactionDuration: number;

  /**
   * Flag to discard all spans that occur in background. This includes transactions. Browser background tab timing is
   * not suited towards doing precise measurements of operations. That's why this option discards any active transaction
   * and also doesn't add any spans that happen in the background. Background spans/transaction can mess up your
   * statistics in non deterministic ways that's why we by default recommend leaving this opition enabled.
   *
   * Default: true
   */
  discardBackgroundSpans: boolean;
}

/** JSDoc */
interface Activity {
  name: string;
  span?: Span;
}

const global = getGlobalObject<Window>();
const defaultTracingOrigins = ['localhost', /^\//];

/**
 * Tracing Integration
 */
export class Tracing implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = Tracing.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Tracing';

  /**
   * Is Tracing enabled, this will be determined once per pageload.
   */
  private static _enabled?: boolean;

  /** JSDoc */
  public static options: TracingOptions;

  /**
   * Returns current hub.
   */
  private static _getCurrentHub?: () => Hub;

  private static _activeTransaction?: Span;

  private static _currentIndex: number = 1;

  public static _activities: { [key: number]: Activity } = {};

  private static _debounce: number = 0;

  private readonly _emitOptionsWarning: boolean = false;

  private static _performanceCursor: number = 0;

  private static _heartbeatTimer: number = 0;

  private static _prevHeartbeatString: string | undefined;

  private static _heartbeatCounter: number = 0;

  /**
   * Constructor for Tracing
   *
   * @param _options TracingOptions
   */
  public constructor(_options?: Partial<TracingOptions>) {
    if (global.performance) {
      global.performance.mark('sentry-tracing-init');
    }
    const defaults = {
      discardBackgroundSpans: true,
      idleTimeout: 500,
      maxTransactionDuration: 600,
      shouldCreateSpanForRequest(url: string): boolean {
        const origins = (_options && _options.tracingOrigins) || defaultTracingOrigins;
        return (
          origins.some((origin: string | RegExp) => isMatchingPattern(url, origin)) &&
          !isMatchingPattern(url, 'sentry_key')
        );
      },
      startTransactionOnLocationChange: true,
      traceFetch: true,
      traceXHR: true,
      tracesSampleRate: 1,
      tracingOrigins: defaultTracingOrigins,
    };
    // NOTE: Logger doesn't work in contructors, as it's initialized after integrations instances
    if (!_options || !Array.isArray(_options.tracingOrigins) || _options.tracingOrigins.length === 0) {
      this._emitOptionsWarning = true;
    }
    Tracing.options = {
      ...defaults,
      ..._options,
    };
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    Tracing._getCurrentHub = getCurrentHub;

    if (this._emitOptionsWarning) {
      logger.warn(
        '[Tracing] You need to define `tracingOrigins` in the options. Set an array of urls or patterns to trace.',
      );
      logger.warn(`[Tracing] We added a reasonable default for you: ${defaultTracingOrigins}`);
    }

    if (!Tracing._isEnabled()) {
      return;
    }

    // Starting our inital pageload transaction
    if (global.location && global.location.href) {
      // `${global.location.href}` will be used a temp transaction name
      Tracing.startIdleTransaction(global.location.href, {
        op: 'pageload',
        sampled: true,
      });
    }

    this._setupXHRTracing();

    this._setupFetchTracing();

    this._setupHistory();

    this._setupErrorHandling();

    this._setupBackgroundTabDetection();

    Tracing._pingHeartbeat();

    // This EventProcessor makes sure that the transaction is not longer than maxTransactionDuration
    addGlobalEventProcessor((event: Event) => {
      const self = getCurrentHub().getIntegration(Tracing);
      if (!self) {
        return event;
      }

      if (Tracing._isEnabled()) {
        const isOutdatedTransaction =
          event.timestamp &&
          event.start_timestamp &&
          (event.timestamp - event.start_timestamp > Tracing.options.maxTransactionDuration ||
            event.timestamp - event.start_timestamp < 0);

        if (Tracing.options.maxTransactionDuration !== 0 && event.type === 'transaction' && isOutdatedTransaction) {
          logger.log('[Tracing] Discarded transaction since it maxed out maxTransactionDuration');
          return null;
        }
      }

      return event;
    });
  }

  /**
   * Pings the heartbeat
   */
  private static _pingHeartbeat(): void {
    Tracing._heartbeatTimer = (setTimeout(() => {
      Tracing._beat();
    }, 5000) as any) as number;
  }

  /**
   * Checks when entries of Tracing._activities are not changing for 3 beats. If this occurs we finish the transaction
   *
   */
  private static _beat(): void {
    clearTimeout(Tracing._heartbeatTimer);
    const keys = Object.keys(Tracing._activities);
    if (keys.length) {
      const heartbeatString = keys.reduce((prev: string, current: string) => prev + current);
      if (heartbeatString === Tracing._prevHeartbeatString) {
        Tracing._heartbeatCounter++;
      } else {
        Tracing._heartbeatCounter = 0;
      }
      if (Tracing._heartbeatCounter >= 3) {
        if (Tracing._activeTransaction) {
          logger.log(
            "[Tracing] Heartbeat safeguard kicked in, finishing transaction since activities content hasn't changed for 3 beats",
          );
          Tracing._activeTransaction.setStatus(SpanStatus.DeadlineExceeded);
          Tracing._activeTransaction.setTag('heartbeat', 'failed');
          Tracing.finishIdleTransaction();
        }
      }
      Tracing._prevHeartbeatString = heartbeatString;
    }
    Tracing._pingHeartbeat();
  }

  /**
   * Discards active transactions if tab moves to background
   */
  private _setupBackgroundTabDetection(): void {
    if (Tracing.options.discardBackgroundSpans && global.document) {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && Tracing._activeTransaction) {
          logger.log('[Tracing] Discarded active transaction incl. activities since tab moved to the background');
          Tracing._resetActiveTransaction();
        }
      });
    }
  }

  /**
   * Unsets the current active transaction + activities
   */
  private static _resetActiveTransaction(): void {
    Tracing._activeTransaction = undefined;
    Tracing._activities = {};
  }

  /**
   * Registers to History API to detect navigation changes
   */
  private _setupHistory(): void {
    if (Tracing.options.startTransactionOnLocationChange) {
      addInstrumentationHandler({
        callback: historyCallback,
        type: 'history',
      });
    }
  }

  /**
   * Attaches to fetch to add sentry-trace header + creating spans
   */
  private _setupFetchTracing(): void {
    if (Tracing.options.traceFetch && supportsNativeFetch()) {
      addInstrumentationHandler({
        callback: fetchCallback,
        type: 'fetch',
      });
    }
  }

  /**
   * Attaches to XHR to add sentry-trace header + creating spans
   */
  private _setupXHRTracing(): void {
    if (Tracing.options.traceXHR) {
      addInstrumentationHandler({
        callback: xhrCallback,
        type: 'xhr',
      });
    }
  }

  /**
   * Configures global error listeners
   */
  private _setupErrorHandling(): void {
    // tslint:disable-next-line: completed-docs
    function errorCallback(): void {
      if (Tracing._activeTransaction) {
        /**
         * If an error or unhandled promise occurs, we mark the active transaction as failed
         */
        logger.log(`[Tracing] Global error occured, setting status in transaction: ${SpanStatus.InternalError}`);
        (Tracing._activeTransaction as SpanClass).setStatus(SpanStatus.InternalError);
      }
    }
    addInstrumentationHandler({
      callback: errorCallback,
      type: 'error',
    });
    addInstrumentationHandler({
      callback: errorCallback,
      type: 'unhandledrejection',
    });
  }

  /**
   * Is tracing enabled
   */
  private static _isEnabled(): boolean {
    if (Tracing._enabled !== undefined) {
      return Tracing._enabled;
    }
    // This happens only in test cases where the integration isn't initalized properly
    // tslint:disable-next-line: strict-type-predicates
    if (!Tracing.options || typeof Tracing.options.tracesSampleRate !== 'number') {
      return false;
    }
    Tracing._enabled = Math.random() > Tracing.options.tracesSampleRate ? false : true;
    return Tracing._enabled;
  }

  /**
   * Starts a Transaction waiting for activity idle to finish
   */
  public static startIdleTransaction(name: string, spanContext?: SpanContext): Span | undefined {
    if (!Tracing._isEnabled()) {
      // Tracing is not enabled
      return undefined;
    }

    // If we already have an active transaction it means one of two things
    // a) The user did rapid navigation changes and didn't wait until the transaction was finished
    // b) A activity wasn't popped correctly and therefore the transaction is stalling
    Tracing.finishIdleTransaction();

    logger.log('[Tracing] startIdleTransaction, name:', name);

    const _getCurrentHub = Tracing._getCurrentHub;
    if (!_getCurrentHub) {
      return undefined;
    }

    const hub = _getCurrentHub();
    if (!hub) {
      return undefined;
    }

    const span = hub.startSpan(
      {
        ...spanContext,
        transaction: name,
      },
      true,
    );

    Tracing._activeTransaction = span;

    // We need to do this workaround here and not use configureScope
    // Reason being at the time we start the inital transaction we do not have a client bound on the hub yet
    // therefore configureScope wouldn't be executed and we would miss setting the transaction
    // tslint:disable-next-line: no-unsafe-any
    (hub as any).getScope().setSpan(span);

    // The reason we do this here is because of cached responses
    // If we start and transaction without an activity it would never finish since there is no activity
    const id = Tracing.pushActivity('idleTransactionStarted');
    setTimeout(() => {
      Tracing.popActivity(id);
    }, (Tracing.options && Tracing.options.idleTimeout) || 100);

    return span;
  }

  /**
   * Update transaction
   * @deprecated
   */
  public static updateTransactionName(name: string): void {
    logger.log('[Tracing] DEPRECATED, use Sentry.configureScope => scope.setTransaction instead', name);
    const _getCurrentHub = Tracing._getCurrentHub;
    if (_getCurrentHub) {
      const hub = _getCurrentHub();
      if (hub) {
        hub.configureScope(scope => {
          scope.setTransaction(name);
        });
      }
    }
  }

  /**
   * Finshes the current active transaction
   */
  public static finishIdleTransaction(): void {
    const active = Tracing._activeTransaction as SpanClass;
    if (active) {
      Tracing._addPerformanceEntries(active);
      logger.log('[Tracing] finishIdleTransaction', active.transaction);
      // true = use timestamp of last span
      active.finish(true);
      Tracing._resetActiveTransaction();
    }
  }

  /**
   * This uses `performance.getEntries()` to add additional spans to the active transaction.
   * Also, we update our timings since we consider the timings in this API to be more correct than our manual
   * measurements.
   *
   * @param transactionSpan The transaction span
   */
  private static _addPerformanceEntries(transactionSpan: SpanClass): void {
    if (!global.performance) {
      // Gatekeeper if performance API not available
      return;
    }

    logger.log('[Tracing] Adding & adjusting spans using Performance API');

    const timeOrigin = Tracing._msToSec(performance.timeOrigin);

    // tslint:disable-next-line: completed-docs
    function addSpan(span: SpanClass): void {
      if (transactionSpan.spanRecorder) {
        transactionSpan.spanRecorder.finishSpan(span);
      }
    }

    // tslint:disable-next-line: completed-docs
    function addPerformanceNavigationTiming(parent: SpanClass, entry: { [key: string]: number }, event: string): void {
      const span = parent.child({
        description: event,
        op: 'browser',
      });
      span.startTimestamp = timeOrigin + Tracing._msToSec(entry[`${event}Start`]);
      span.timestamp = timeOrigin + Tracing._msToSec(entry[`${event}End`]);
      addSpan(span);
    }

    // tslint:disable-next-line: completed-docs
    function addRequest(parent: SpanClass, entry: { [key: string]: number }): void {
      const request = parent.child({
        description: 'request',
        op: 'browser',
      });
      request.startTimestamp = timeOrigin + Tracing._msToSec(entry.requestStart);
      request.timestamp = timeOrigin + Tracing._msToSec(entry.responseEnd);
      addSpan(request);
      const response = parent.child({
        description: 'response',
        op: 'browser',
      });
      response.startTimestamp = timeOrigin + Tracing._msToSec(entry.responseStart);
      response.timestamp = timeOrigin + Tracing._msToSec(entry.responseEnd);
      addSpan(response);
    }

    let entryScriptSrc: string | undefined;

    if (global.document) {
      // tslint:disable-next-line: prefer-for-of
      for (let i = 0; i < document.scripts.length; i++) {
        // We go through all scripts on the page and look for 'data-entry'
        // We remember the name and measure the time between this script finished loading and
        // our mark 'sentry-tracing-init'
        if (document.scripts[i].dataset.entry === 'true') {
          entryScriptSrc = document.scripts[i].src;
          break;
        }
      }
    }

    let entryScriptStartEndTime: number | undefined;
    let tracingInitMarkStartTime: number | undefined;

    // tslint:disable: no-unsafe-any
    performance
      .getEntries()
      .slice(Tracing._performanceCursor)
      .forEach((entry: any) => {
        const startTime = Tracing._msToSec(entry.startTime as number);
        const duration = Tracing._msToSec(entry.duration as number);

        if (transactionSpan.op === 'navigation' && timeOrigin + startTime < transactionSpan.startTimestamp) {
          logger.log('[Tracing] Discarded performance entry because of navigation');
          return;
        }

        switch (entry.entryType) {
          case 'navigation':
            addPerformanceNavigationTiming(transactionSpan, entry, 'unloadEvent');
            addPerformanceNavigationTiming(transactionSpan, entry, 'domContentLoadedEvent');
            addPerformanceNavigationTiming(transactionSpan, entry, 'loadEvent');
            addPerformanceNavigationTiming(transactionSpan, entry, 'connect');
            addPerformanceNavigationTiming(transactionSpan, entry, 'domainLookup');
            addRequest(transactionSpan, entry);
            break;
          case 'mark':
          case 'paint':
          case 'measure':
            const mark = transactionSpan.child({
              description: `${entry.entryType} ${entry.name}`,
              op: 'mark',
            });
            mark.startTimestamp = timeOrigin + startTime;
            mark.timestamp = mark.startTimestamp + duration;
            if (tracingInitMarkStartTime === undefined && entry.name === 'sentry-tracing-init') {
              tracingInitMarkStartTime = mark.startTimestamp;
            }
            addSpan(mark);
            break;
          case 'resource':
            const resourceName = entry.name.replace(window.location.origin, '');
            if (entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch') {
              // We need to update existing spans with new timing info
              if (transactionSpan.spanRecorder) {
                transactionSpan.spanRecorder.finishedSpans.map((finishedSpan: SpanClass) => {
                  if (finishedSpan.description && finishedSpan.description.indexOf(resourceName) !== -1) {
                    finishedSpan.startTimestamp = timeOrigin + startTime;
                    finishedSpan.timestamp = finishedSpan.startTimestamp + duration;
                  }
                });
              }
            } else {
              const resource = transactionSpan.child({
                description: `${entry.initiatorType} ${resourceName}`,
                op: `resource`,
              });
              resource.startTimestamp = timeOrigin + startTime;
              resource.timestamp = resource.startTimestamp + duration;
              // We remember the entry script end time to calculate the difference to the first init mark
              if (entryScriptStartEndTime === undefined && (entryScriptSrc || '').includes(resourceName)) {
                entryScriptStartEndTime = resource.timestamp;
              }
              addSpan(resource);
            }
            break;
          default:
          // Ignore other entry types.
        }
      });

    if (entryScriptStartEndTime !== undefined && tracingInitMarkStartTime !== undefined) {
      const evaluation = transactionSpan.child({
        description: 'evaluation',
        op: `script`,
      });
      evaluation.startTimestamp = entryScriptStartEndTime;
      evaluation.timestamp = tracingInitMarkStartTime;
      addSpan(evaluation);
    }

    // The Performance object has a limited buffer size, often 150 entries. At some point the buffer may overflow, in
    // which case we would not be able to use it to create/update spans. Therefore, after we have processed entries to
    // report to Sentry, we clear the buffer in an attempt to allow for more entries to be added in the future.
    // https://developer.mozilla.org/en-US/docs/Web/API/Performance
    logger.log('[Tracing] Clearing most performance marks');
    performance.clearMarks();
    performance.clearMeasures();
    performance.clearResourceTimings();
    Tracing._performanceCursor = Math.max(performance.getEntries().length - 1, 0);

    // tslint:enable: no-unsafe-any
  }

  /**
   * Sets the status of the current active transaction (if there is one)
   */
  public static setTransactionStatus(status: SpanStatus): void {
    const active = Tracing._activeTransaction;
    if (active) {
      logger.log('[Tracing] setTransactionStatus', status);
      active.setStatus(status);
    }
  }

  /**
   * Converts from milliseconds to seconds
   * @param time time in ms
   */
  private static _msToSec(time: number): number {
    return time / 1000;
  }

  /**
   * Starts tracking for a specifc activity
   *
   * @param name Name of the activity, can be any string (Only used internally to identify the activity)
   * @param spanContext If provided a Span with the SpanContext will be created.
   * @param options _autoPopAfter_ | Time in ms, if provided the activity will be popped automatically after this timeout. This can be helpful in cases where you cannot gurantee your application knows the state and calls `popActivity` for sure.
   */
  public static pushActivity(
    name: string,
    spanContext?: SpanContext,
    options?: {
      autoPopAfter?: number;
    },
  ): number {
    if (!Tracing._isEnabled()) {
      // Tracing is not enabled
      return 0;
    }
    if (!Tracing._activeTransaction) {
      logger.log(`[Tracing] Not pushing activity ${name} since there is no active transaction`);
      return 0;
    }

    // We want to clear the timeout also here since we push a new activity
    clearTimeout(Tracing._debounce);

    const _getCurrentHub = Tracing._getCurrentHub;
    if (spanContext && _getCurrentHub) {
      const hub = _getCurrentHub();
      if (hub) {
        const span = hub.startSpan(spanContext);
        Tracing._activities[Tracing._currentIndex] = {
          name,
          span,
        };
      }
    } else {
      Tracing._activities[Tracing._currentIndex] = {
        name,
      };
    }

    logger.log(`[Tracing] pushActivity: ${name}#${Tracing._currentIndex}`);
    logger.log('[Tracing] activies count', Object.keys(Tracing._activities).length);
    if (options && typeof options.autoPopAfter === 'number') {
      logger.log(`[Tracing] auto pop of: ${name}#${Tracing._currentIndex} in ${options.autoPopAfter}ms`);
      const index = Tracing._currentIndex;
      setTimeout(() => {
        Tracing.popActivity(index, {
          autoPop: true,
          status: SpanStatus.DeadlineExceeded,
        });
      }, options.autoPopAfter);
    }
    return Tracing._currentIndex++;
  }

  /**
   * Removes activity and finishes the span in case there is one
   */
  public static popActivity(id: number, spanData?: { [key: string]: any }): void {
    // The !id is on purpose to also fail with 0
    // Since 0 is returned by push activity in case tracing is not enabled
    // or there is no active transaction
    if (!Tracing._isEnabled() || !id) {
      // Tracing is not enabled
      return;
    }

    const activity = Tracing._activities[id];

    if (activity) {
      logger.log(`[Tracing] popActivity ${activity.name}#${id}`);
      const span = activity.span as SpanClass;
      if (span) {
        if (spanData) {
          Object.keys(spanData).forEach((key: string) => {
            span.setData(key, spanData[key]);
            if (key === 'status_code') {
              span.setHttpStatus(spanData[key] as number);
            }
            if (key === 'status') {
              span.setStatus(spanData[key] as SpanStatus);
            }
          });
        }
        span.finish();
      }
      // tslint:disable-next-line: no-dynamic-delete
      delete Tracing._activities[id];
    }

    const count = Object.keys(Tracing._activities).length;
    clearTimeout(Tracing._debounce);

    logger.log('[Tracing] activies count', count);

    if (count === 0 && Tracing._activeTransaction) {
      const timeout = Tracing.options && Tracing.options.idleTimeout;
      logger.log(`[Tracing] Flushing Transaction in ${timeout}ms`);
      Tracing._debounce = (setTimeout(() => {
        Tracing.finishIdleTransaction();
      }, timeout) as any) as number;
    }
  }
}

/**
 * Creates breadcrumbs from XHR API calls
 */
function xhrCallback(handlerData: { [key: string]: any }): void {
  if (!Tracing.options.traceXHR) {
    return;
  }

  // tslint:disable-next-line: no-unsafe-any
  if (!handlerData || !handlerData.xhr || !handlerData.xhr.__sentry_xhr__) {
    return;
  }

  // tslint:disable: no-unsafe-any
  const xhr = handlerData.xhr.__sentry_xhr__;

  if (!Tracing.options.shouldCreateSpanForRequest(xhr.url)) {
    return;
  }

  // We only capture complete, non-sentry requests
  if (handlerData.xhr.__sentry_own_request__) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.xhr.__sentry_xhr_activity_id__) {
    Tracing.popActivity(handlerData.xhr.__sentry_xhr_activity_id__, handlerData.xhr.__sentry_xhr__);
    return;
  }

  handlerData.xhr.__sentry_xhr_activity_id__ = Tracing.pushActivity('xhr', {
    data: {
      ...xhr.data,
      type: 'xhr',
    },
    description: `${xhr.method} ${xhr.url}`,
    op: 'http',
  });

  // Adding the trace header to the span
  const activity = Tracing._activities[handlerData.xhr.__sentry_xhr_activity_id__];
  if (activity) {
    const span = activity.span;
    if (span && handlerData.xhr.setRequestHeader) {
      handlerData.xhr.setRequestHeader('sentry-trace', span.toTraceparent());
    }
  }
  // tslint:enable: no-unsafe-any
}

/**
 * Creates breadcrumbs from fetch API calls
 */
function fetchCallback(handlerData: { [key: string]: any }): void {
  // tslint:disable: no-unsafe-any
  if (!Tracing.options.traceFetch) {
    return;
  }

  if (!Tracing.options.shouldCreateSpanForRequest(handlerData.fetchData.url)) {
    return;
  }

  if (handlerData.endTimestamp && handlerData.fetchData.__activity) {
    Tracing.popActivity(handlerData.fetchData.__activity, handlerData.fetchData);
  } else {
    handlerData.fetchData.__activity = Tracing.pushActivity('fetch', {
      data: {
        ...handlerData.fetchData,
        type: 'fetch',
      },
      description: `${handlerData.fetchData.method} ${handlerData.fetchData.url}`,
      op: 'http',
    });

    const activity = Tracing._activities[handlerData.fetchData.__activity];
    if (activity) {
      const span = activity.span;
      if (span) {
        const options = (handlerData.args[1] = (handlerData.args[1] as { [key: string]: any }) || {});
        if (options.headers) {
          if (Array.isArray(options.headers)) {
            options.headers = [...options.headers, { 'sentry-trace': span.toTraceparent() }];
          } else {
            options.headers = {
              ...options.headers,
              'sentry-trace': span.toTraceparent(),
            };
          }
        } else {
          options.headers = { 'sentry-trace': span.toTraceparent() };
        }
      }
    }
  }
  // tslint:enable: no-unsafe-any
}

/**
 * Creates transaction from navigation changes
 */
function historyCallback(_: { [key: string]: any }): void {
  if (Tracing.options.startTransactionOnLocationChange && global && global.location) {
    Tracing.startIdleTransaction(global.location.href, {
      op: 'navigation',
      sampled: true,
    });
  }
}
