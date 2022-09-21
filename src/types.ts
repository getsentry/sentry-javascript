import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb/typings/types';

export type RecordingEvent = eventWithTime;
export type RecordingConfig = Parameters<typeof record>[0];

export type RecordedEvents = Uint8Array | string;

export type AllPerformanceEntry =
  | PerformancePaintTiming
  | PerformanceResourceTiming
  | PerformanceNavigationTiming;

export interface ReplayRequest {
  endpoint: string;
  events: RecordedEvents;
  replayId: string;
  segmentId: number;
}

export type InstrumentationTypeBreadcrumb = 'dom' | 'scope';
export type InstrumentationTypeSpan = 'fetch' | 'xhr' | 'history';
export type InstrumentationType =
  | InstrumentationTypeBreadcrumb
  | InstrumentationTypeSpan
  | 'console'
  | 'error'
  | 'unhandledrejection';

/**
 * The request payload to worker
 */
export interface WorkerRequest {
  id: number;
  method: string;
  args: any[];
}

declare global {
  const __SENTRY_REPLAY_VERSION__: string;
}

/**
 * The response from the worker
 */
export interface WorkerResponse {
  id: number;
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

  /**
   * Mask all text in recordings. All text will be replaced with asterisks by default.
   */
  maskAllText?: boolean;
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

/**
 * Additional context that will be sent w/ `replay_event`
 */
export interface ReplayEventContext {
  /**
   * Set of Sentry error ids that have occurred during a replay segment
   */
  errorIds: Set<string>;

  /**
   * Set of Sentry trace ids that have occurred during a replay segment
   */
  traceIds: Set<string>;

  /**
   * Ordered list of URLs that have been visited during a replay segment
   */
  urls: string[];

  /**
   * The timestamp of the earliest event that has been added to event buffer. This can happen due to the Performance Observer which buffers events.
   */
  earliestEvent: number | null;
}
