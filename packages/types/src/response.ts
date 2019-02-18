import { Event } from './event';
import { Status } from './status';

/** JSDoc */
export interface Response {
  status: Status;
  event?: Event;
  reason?: string;
}
