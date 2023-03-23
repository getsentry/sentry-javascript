import type {
  AggregationCounts,
  Client,
  RequestSessionStatus,
  SessionAggregates,
  SessionFlusherLike,
} from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';

import { getCurrentHub } from './hub';

type ReleaseHealthAttributes = {
  environment?: string;
  release: string;
};

/**
 * @inheritdoc
 */
export class SessionFlusher implements SessionFlusherLike {
  public readonly flushTimeout: number = 60;
  private _pendingAggregates: Record<number, AggregationCounts> = {};
  private _sessionAttrs: ReleaseHealthAttributes;
  private _intervalId: ReturnType<typeof setInterval>;
  private _isEnabled: boolean = true;
  private _client: Client;

  public constructor(client: Client, attrs: ReleaseHealthAttributes) {
    this._client = client;
    // Call to setInterval, so that flush is called every 60 seconds
    this._intervalId = setInterval(() => this.flush(), this.flushTimeout * 1000);
    this._sessionAttrs = attrs;
  }

  /** Checks if `pendingAggregates` has entries, and if it does flushes them by calling `sendSession` */
  public flush(): void {
    const sessionAggregates = this.getSessionAggregates();
    if (sessionAggregates.aggregates.length === 0) {
      return;
    }
    this._pendingAggregates = {};
    this._client.sendSession(sessionAggregates);
  }

  /** Massages the entries in `pendingAggregates` and returns aggregated sessions */
  public getSessionAggregates(): SessionAggregates {
    const aggregates: AggregationCounts[] = Object.keys(this._pendingAggregates).map((key: string) => {
      return this._pendingAggregates[parseInt(key)];
    });

    const sessionAggregates: SessionAggregates = {
      attrs: this._sessionAttrs,
      aggregates,
    };
    return dropUndefinedKeys(sessionAggregates);
  }

  /** JSDoc */
  public close(): void {
    clearInterval(this._intervalId);
    this._isEnabled = false;
    this.flush();
  }

  /**
   * Wrapper function for _incrementSessionStatusCount that checks if the instance of SessionFlusher is enabled then
   * fetches the session status of the request from `Scope.getRequestSession().status` on the scope and passes them to
   * `_incrementSessionStatusCount` along with the start date
   */
  public incrementSessionStatusCount(): void {
    if (!this._isEnabled) {
      return;
    }
    const scope = getCurrentHub().getScope();
    const requestSession = scope && scope.getRequestSession();

    if (requestSession && requestSession.status) {
      this._incrementSessionStatusCount(requestSession.status, new Date());
      // This is not entirely necessarily but is added as a safe guard to indicate the bounds of a request and so in
      // case captureRequestSession is called more than once to prevent double count
      if (scope) {
        scope.setRequestSession(undefined);
      }
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    }
  }

  /**
   * Increments status bucket in pendingAggregates buffer (internal state) corresponding to status of
   * the session received
   */
  private _incrementSessionStatusCount(status: RequestSessionStatus, date: Date): number {
    // Truncate minutes and seconds on Session Started attribute to have one minute bucket keys
    const sessionStartedTrunc = new Date(date).setSeconds(0, 0);
    this._pendingAggregates[sessionStartedTrunc] = this._pendingAggregates[sessionStartedTrunc] || {};

    // corresponds to aggregated sessions in one specific minute bucket
    // for example, {"started":"2021-03-16T08:00:00.000Z","exited":4, "errored": 1}
    const aggregationCounts: AggregationCounts = this._pendingAggregates[sessionStartedTrunc];
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
}
