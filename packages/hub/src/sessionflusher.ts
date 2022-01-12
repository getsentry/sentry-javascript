import { AggregationCounts, RequestSessionStatus, SessionAggregates, Transport } from '@sentry/types';
import { dropUndefinedKeys, logger } from '@sentry/utils';

import { getCurrentHub, getScope } from './hub';
import { getRequestSession, setRequestSession } from './scope';

type ReleaseHealthAttributes = {
  environment?: string;
  release: string;
};

/**
 * @inheritdoc
 */
export class SessionFlusher {
  public readonly flushTimeout: number = 60;
  public pendingAggregates: Record<number, AggregationCounts> = {};
  public sessionAttrs: ReleaseHealthAttributes;
  public intervalId: ReturnType<typeof setInterval>;
  public isEnabled: boolean = true;
  public transport: Transport;

  public constructor(transport: Transport, attrs: ReleaseHealthAttributes) {
    this.transport = transport;
    // Call to setInterval, so that flush is called every 60 seconds
    this.intervalId = setInterval(() => flush(this), this.flushTimeout * 1000);
    this.sessionAttrs = attrs;
  }
}

/** Submits the aggregates request mode sessions to Sentry */
function sendSessionAggregates(sessionFlusher: SessionFlusher, sessionAggregates: SessionAggregates): void {
  // TODO: But why to take a Transport when it may be the case that doesn't implement the callback?
  // The only point of taking `transport` is to call this one function thou.
  if (!sessionFlusher.transport.sendSession) {
    logger.warn("Dropping session because custom transport doesn't implement sendSession");
    return;
  }
  void sessionFlusher.transport.sendSession(sessionAggregates).then(null, reason => {
    logger.error(`Error while sending session: ${reason}`);
  });
}

/**
 * Empties Aggregate Buckets and Sends them to Transport Buffer.
 * Checks if `pendingAggregates` has entries, and if it does flushes them by calling `sendSessions`
 * */
function flush(sessionFlusher: SessionFlusher): void {
  const sessionAggregates = getSessionAggregates(sessionFlusher);
  if (sessionAggregates.aggregates.length === 0) {
    return;
  }
  sessionFlusher.pendingAggregates = {};
  sendSessionAggregates(sessionFlusher, sessionAggregates);
}

/** Massages the entries in `pendingAggregates` and returns aggregated sessions */
export function getSessionAggregates(sessionFlusher: SessionFlusher): SessionAggregates {
  const aggregates: AggregationCounts[] = Object.keys(sessionFlusher.pendingAggregates).map((key: string) => {
    return sessionFlusher.pendingAggregates[parseInt(key)];
  });

  const sessionAggregates: SessionAggregates = {
    attrs: sessionFlusher.sessionAttrs,
    aggregates,
  };
  return dropUndefinedKeys(sessionAggregates);
}

/** Clears setInterval and calls flush */
export function closeSessionFlusher(sessionFlusher: SessionFlusher): void {
  clearInterval(sessionFlusher.intervalId);
  sessionFlusher.isEnabled = false;
  flush(sessionFlusher);
}

/**
 * Increments the Session Status bucket in SessionAggregates Object corresponding to the status of the session captured.
 *
 * Wrapper function for _incrementSessionStatusCount that checks if the instance of SessionFlusher is enabled then
 * fetches the session status of the request from `Scope.getRequestSession().status` on the scope and passes them to
 * `_incrementSessionStatusCount` along with the start date
 */
export function incrementSessionStatusCount(sessionFlusher: SessionFlusher): void {
  if (!sessionFlusher.isEnabled) {
    return;
  }
  const scope = getScope(getCurrentHub());
  const requestSession = scope && getRequestSession(scope);

  if (requestSession && requestSession.status) {
    _incrementSessionStatusCount(sessionFlusher, requestSession.status, new Date());
    // This is not entirely necessarily but is added as a safe guard to indicate the bounds of a request and so in
    // case captureRequestSession is called more than once to prevent double count
    if (scope) {
      setRequestSession(scope, undefined);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
  }
}

/**
 * Increments status bucket in pendingAggregates buffer (internal state) corresponding to status of
 * the session received
 */
export function _incrementSessionStatusCount(
  sessionFlusher: SessionFlusher,
  status: RequestSessionStatus,
  date: Date,
): number {
  // Truncate minutes and seconds on Session Started attribute to have one minute bucket keys
  const sessionStartedTrunc = new Date(date).setSeconds(0, 0);
  sessionFlusher.pendingAggregates[sessionStartedTrunc] = sessionFlusher.pendingAggregates[sessionStartedTrunc] || {};

  // corresponds to aggregated sessions in one specific minute bucket
  // for example, {"started":"2021-03-16T08:00:00.000Z","exited":4, "errored": 1}
  const aggregationCounts: AggregationCounts = sessionFlusher.pendingAggregates[sessionStartedTrunc];
  if (!aggregationCounts.started) {
    aggregationCounts.started = new Date(sessionStartedTrunc).toISOString();
  }

  switch (status) {
    case 'errored':
      aggregationCounts.errored = (aggregationCounts.errored || 0) + 1;
      return aggregationCounts.errored;
    case 'ok':
      aggregationCounts.exited = (aggregationCounts.exited || 0) + 1;
      return aggregationCounts.exited;
    default:
      aggregationCounts.crashed = (aggregationCounts.crashed || 0) + 1;
      return aggregationCounts.crashed;
  }
}
