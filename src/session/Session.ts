import { uuid4 } from '@sentry/utils';
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
   * Sequence ID specific to replay updates
   */
  sequenceId: number;
}

interface SessionOptions {
  stickySession?: boolean;
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
  private _sequenceId;

  public readonly options: Required<SessionOptions>;

  constructor(
    session: Partial<SessionObject> = {},
    { stickySession = false }: SessionOptions = {}
  ) {
    const now = new Date().getTime();
    this._id = session.id || uuid4();
    this._started = session.started ?? now;
    this._lastActivity = session.lastActivity ?? now;
    this._sequenceId = session.sequenceId ?? 0;

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

  get sequenceId() {
    return this._sequenceId;
  }

  set sequenceId(id: number) {
    this._sequenceId = id;
    if (this.options.stickySession) {
      saveSession(this);
    }
  }

  toJSON() {
    return {
      id: this.id,
      started: this.started,
      lastActivity: this.lastActivity,
      sequenceId: this._sequenceId,
    } as SessionObject;
  }
}
