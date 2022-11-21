import { uuid4 } from '@sentry/utils';

import { SampleRates, SessionOptions } from '../types';
import { isSampled } from '../util/isSampled';

import { saveSession } from './saveSession';

type StickyOption = Required<Pick<SessionOptions, 'stickySession'>>;

type Sampled = false | 'session' | 'error';

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
   * Is the session sampled? `null` if the sampled, otherwise, `session` or `error`
   */
  sampled: Sampled;
}

export class Session {
  /**
   * Session ID
   */
  private _id: string;

  /**
   * Start time of current session
   */
  private _started: number;

  /**
   * Last known activity of the session
   */
  private _lastActivity: number;

  /**
   * Sequence ID specific to replay updates
   */
  private _segmentId: number;

  /**
   * Previous session ID
   */
  private _previousSessionId: string | undefined;

  /**
   * Is the Session sampled?
   */
  private _sampled: Sampled;

  public readonly options: StickyOption;

  constructor(
    session: Partial<SessionObject> = {},
    {
      stickySession,
      sessionSampleRate,
      errorSampleRate,
    }: StickyOption & SampleRates
  ) {
    const now = new Date().getTime();
    this._id = session.id || uuid4();
    this._started = session.started ?? now;
    this._lastActivity = session.lastActivity ?? now;
    this._segmentId = session.segmentId ?? 0;
    this._sampled =
      session.sampled ??
      (isSampled(sessionSampleRate)
        ? 'session'
        : isSampled(errorSampleRate)
        ? 'error'
        : false);

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

  set started(newDate: number) {
    this._started = newDate;
    if (this.options.stickySession) {
      saveSession(this);
    }
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

  set sampled(_isSampled: Sampled) {
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
