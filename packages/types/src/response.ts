import { Event, EventType } from './event';
import { Session } from './session';
import { StatusType } from './status';

/** JSDoc */
export interface Response {
  status: StatusType;
  event?: Event | Session;
  type?: EventType;
  reason?: string;
}
