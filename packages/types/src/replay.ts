import { Event } from './event';

/**
 * NOTE: These types are still considered Beta and subject to change.
 * @hidden
 */
export interface ReplayEvent extends Event {
  event_id: string;
  urls: string[];
  error_ids: string[];
  trace_ids: string[];
  replay_id: string;
  segment_id: number;
}

/**
 * NOTE: These types are still considered Beta and subject to change.
 * @hidden
 */
export type ReplayRecordingData = string | Uint8Array;
