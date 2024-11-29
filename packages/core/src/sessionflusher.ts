import { getIsolationScope } from './currentScopes';
import type {
  AggregationCounts,
  Client,
  RequestSessionStatus,
  SessionAggregates,
  SessionFlusherLike,
} from './types-hoist';
import { dropUndefinedKeys } from './utils-hoist/object';

type ReleaseHealthAttributes = {
  environment?: string;
  release: string;
};

/**
 * @inheritdoc
 */
export class SessionFlusher implements SessionFlusherLike {
  public readonly flushTimeout: number;
  private _pendingAggregates: Map<number, AggregationCounts>;
  private _sessionAttrs: ReleaseHealthAttributes;
  // Cast to any so that it can use Node.js timeout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _intervalId: any;
  private _isEnabled: boolean;
  private _client: Client;

  public constructor(client: Client, attrs: ReleaseHealthAttributes) {
    this._client = client;
    this.flushTimeout = 60;
    this._pendingAggregates = new Map<number, AggregationCounts>();
    this._isEnabled = true;

    // Call to setInterval, so that flush is called every 60 seconds.
    this._intervalId = setInterval(() => this.flush(), this.flushTimeout * 1000);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (this._intervalId.unref) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this._intervalId.unref();
    }
    this._sessionAttrs = attrs;
  }

  /** Checks if `pendingAggregates` has entries, and if it does flushes them by calling `sendSession` */
  public flush(): void {
    const sessionAggregates = this.getSessionAggregates();
    if (sessionAggregates.aggregates.length === 0) {
      return;
    }
    this._pendingAggregates = new Map<number, AggregationCounts>();
    this._client.sendSession(sessionAggregates);
  }

  /** Massages the entries in `pendingAggregates` and returns aggregated sessions */
  public getSessionAggregates(): SessionAggregates {
    const aggregates: AggregationCounts[] = Array.from(this._pendingAggregates.values());

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
    const isolationScope = getIsolationScope();
    const requestSession = isolationScope.getRequestSession();

    if (requestSession && requestSession.status) {
      this._incrementSessionStatusCount(requestSession.status, new Date());
      // This is not entirely necessarily but is added as a safe guard to indicate the bounds of a request and so in
      // case captureRequestSession is called more than once to prevent double count
      isolationScope.setRequestSession(undefined);
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

    // corresponds to aggregated sessions in one specific minute bucket
    // for example, {"started":"2021-03-16T08:00:00.000Z","exited":4, "errored": 1}
    let aggregationCounts = this._pendingAggregates.get(sessionStartedTrunc);
    if (!aggregationCounts) {
      aggregationCounts = { started: new Date(sessionStartedTrunc).toISOString() };
      this._pendingAggregates.set(sessionStartedTrunc, aggregationCounts);
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
