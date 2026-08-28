import { REPLAY_MAX_EVENT_BUFFER_SIZE } from '../constants';

/** This error indicates that the event buffer size exceeded the limit.. */
export class EventBufferSizeExceededError extends Error {
  public constructor() {
    super(`Event buffer exceeded maximum size of ${REPLAY_MAX_EVENT_BUFFER_SIZE}.`);
  }
}

/** This error indicates that the compression worker was intentionally destroyed (e.g. on session expiry). */
export class WorkerDestroyedError extends Error {
  public constructor() {
    super('Worker destroyed');
  }
}
