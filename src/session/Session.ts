import { uuid4 } from '@sentry/utils';

import { isSampled } from '@/util/isSampled';

import { saveSession } from './saveSession';

interface SessionObject {
  id: string;

  /**
   * Start time of current session
   */
  started: number;

  /**
   * Last known activity of the session
   */
  lastActivity: number;

  /**
   * Segment ID for replay events
   */
  segmentId: number;

  /**
   * Is the session sampled?
   */
  sampled: boolean;
}

interface SessionOptions {
  stickySession?: boolean;
  samplingRate?: number;
}

export class Session {
  /**
   * Session ID
   */
  private _id: string;

  /**
   * Start time of current session
   */
  private _started;

  /**
   * Last known activity of the session
   */
  private _lastActivity;

  /**
   * Sequence ID specific to replay updates
   */
  private _segmentId;

  /**
   * Previous session ID
   */
  private _previousSessionId: string | undefined;

  /**
   * Is the Session sampled?
   */
  private _sampled: boolean;

  public readonly options: Required<Pick<SessionOptions, 'stickySession'>>;

  constructor(
    session: Partial<SessionObject> = {},
    { stickySession = false, samplingRate = 1.0 }: SessionOptions = {}
  ) {
    const now = new Date().getTime();
    this._id = session.id || uuid4();
    this._started = session.started ?? now;
    this._lastActivity = session.lastActivity ?? now;
    this._segmentId = session.segmentId ?? 0;
    this._sampled = session.sampled ?? isSampled(samplingRate);

    this.options = {
      stickySession,
    };
  }

  get id() {
    return this._id;
  }

  get started() {
    return this._started;
  }

  get lastActivity() {
    return this._lastActivity;
  }

  set lastActivity(newDate: number) {
    this._lastActivity = newDate;
    if (this.options.stickySession) {
      saveSession(this);
    }
  }

  get segmentId() {
    return this._segmentId;
  }

  set segmentId(id: number) {
    this._segmentId = id;
    if (this.options.stickySession) {
      saveSession(this);
    }
  }

  get previousSessionId() {
    return this._previousSessionId;
  }

  set previousSessionId(id: string | undefined) {
    this._previousSessionId = id;
  }

  get sampled() {
    return this._sampled;
  }

  set sampled(_isSampled: boolean) {
    throw new Error('Unable to change sampled value');
  }

  toJSON() {
    return {
      id: this.id,
      started: this.started,
      lastActivity: this.lastActivity,
      segmentId: this._segmentId,
      sampled: this._sampled,
    } as SessionObject;
  }
}
