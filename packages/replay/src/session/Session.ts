import { uuid4 } from '@sentry/utils';

import { SampleRates } from '../types';
import { isSampled } from '../util/isSampled';

type Sampled = false | 'session' | 'error';

export interface SessionObject {
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

/**
 * A wrapper for the session object that handles sampling.
 */
export class Session {
  /**
   * Session ID
   */
  public readonly id: string;

  /**
   * Start time of current session
   */
  public started: number;

  /**
   * Last known activity of the session
   */
  public lastActivity: number;

  /**
   * Sequence ID specific to replay updates
   */
  public segmentId: number;

  /**
   * Previous session ID
   */
  public previousSessionId: string | undefined;

  /**
   * Is the Session sampled?
   */
  public readonly sampled: Sampled;

  public constructor(session: Partial<SessionObject> = {}, { sessionSampleRate, errorSampleRate }: SampleRates) {
    const now = new Date().getTime();
    this.id = session.id || uuid4();
    this.started = session.started ?? now;
    this.lastActivity = session.lastActivity ?? now;
    this.segmentId = session.segmentId ?? 0;
    this.sampled =
      session.sampled ?? (isSampled(sessionSampleRate) ? 'session' : isSampled(errorSampleRate) ? 'error' : false);
  }
}
