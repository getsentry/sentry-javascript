import type { eventWithTime } from 'rrweb/typings/types';

import { record } from 'rrweb';

export type RecordingEvent = eventWithTime;
export type RecordingConfig = Parameters<typeof record>[0];

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
  flushMinDelay?: number;

  /**
   * The max amount of time to wait before sending a replay
   */
  flushMaxDelay?: number;

  /**
   * The amount of time to buffer the initial snapshot
   */
  initialFlushDelay?: number;

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

  /**
   * Only capture replays when an error happens
   */
  captureOnlyOnError?: boolean;

  /**
   * The sampling rate for replays. 1.0 will record all replays, 0 will record none.
   */
  replaysSamplingRate?: number;
}

export interface SentryReplayConfiguration extends SentryReplayPluginOptions {
  /**
   * Options for `rrweb.record()`
   */
  recordingConfig?: RecordingConfig;
}

/**
 * Some initial state captured before creating a root replay event
 */
export interface InitialState {
  timestamp: number;
  url: string;
}
