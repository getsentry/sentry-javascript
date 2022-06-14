import type { eventWithTime } from 'rrweb/typings/types';

import { record } from 'rrweb';

export type RRWebEvent = eventWithTime;
export type RRWebOptions = Parameters<typeof record>[0];

export interface ReplaySpan {
  description: string;
  op: string;
  startTimestamp: number;
  endTimestamp: number;
  data?: Record<string, unknown>;
}

export interface ReplayRequest {
  endpoint: string;
  events: Uint8Array | string;
}

export type InstrumentationType = 'scope' | 'dom' | 'fetch' | 'xhr';

/**
 * The request payload to worker
 */
export interface WorkerRequest {
  method: string;
  args: any[];
}

/**
 * The response from the worker
 */
export interface WorkerResponse {
  method: string;
  success: boolean;
  response: string | Uint8Array;
}

export interface SentryReplayPluginOptions {
  /**
   * The amount of time to wait before sending a replay
   */
  uploadMinDelay?: number;

  /**
   * The max amount of time to wait before sending a replay
   */
  uploadMaxDelay?: number;

  /**
   * If false, will create a new session per pageload
   */
  stickySession?: boolean;

  /**
   * Attempt to use compression when web workers are available
   *
   * (default is true)
   */
  useCompression?: boolean;
}

export interface SentryReplayConfiguration extends SentryReplayPluginOptions {
  /**
   * Options for `rrweb.recordsetup
   */
  rrwebConfig?: RRWebOptions;
}
