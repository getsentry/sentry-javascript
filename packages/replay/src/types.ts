import type { eventWithTime, recordOptions } from 'rrweb/typings/types';

export type RecordingEvent = eventWithTime;
export type RecordingOptions = recordOptions<eventWithTime>;

export type RecordedEvents = Uint8Array | string;

export type AllPerformanceEntry = PerformancePaintTiming | PerformanceResourceTiming | PerformanceNavigationTiming;

export interface SendReplay {
  events: RecordedEvents;
  replayId: string;
  segmentId: number;
  includeReplayStartTimestamp: boolean;
  eventContext: PopEventContext;
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

  // PerformancePaintTiming is only available since TS 4.4, so for now we just define this here
  // see: https://github.com/microsoft/TypeScript/blob/main/lib/lib.dom.d.ts#L10564
  type PerformancePaintTiming = PerformanceEntry;
  // @ts-ignore declare again, this _should_ be there but somehow is not available in worker context
  type PerformanceNavigationTiming = PerformanceEntry;
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

export interface SampleRates {
  /**
   * The sample rate for session-long replays. 1.0 will record all sessions and
   * 0 will record none.
   */
  sessionSampleRate: number;

  /**
   * The sample rate for sessions that has had an error occur. This is
   * independent of `sessionSampleRate`.
   */
  errorSampleRate: number;
}

/**
 * Session options that are configurable by the integration configuration
 */
export interface SessionOptions extends SampleRates {
  /**
   * If false, will create a new session per pageload. Otherwise, saves session
   * to Session Storage.
   */
  stickySession: boolean;
}

export interface ReplayPluginOptions extends SessionOptions {
  /**
   * The amount of time to wait before sending a replay
   */
  flushMinDelay: number;

  /**
   * The max amount of time to wait before sending a replay
   */
  flushMaxDelay: number;

  /**
   * The amount of time to buffer the initial snapshot
   */
  initialFlushDelay: number;

  /**
   * Attempt to use compression when web workers are available
   *
   * (default is true)
   */
  useCompression: boolean;

  /**
   * Only capture replays when an error happens
   *
   * @deprecated
   * @see errorSampleRate
   */
  captureOnlyOnError?: boolean;

  /**
   * The sample rate for replays. 1.0 will record all replays, 0 will record none.
   *
   * @deprecated
   * @see sessionSampleRate
   */
  replaysSamplingRate?: number;

  /**
   * Mask all text in recordings. All text will be replaced with asterisks by default.
   */
  maskAllText: boolean;

  /**
   * Block all media (e.g. images, svg, video) in recordings.
   */
  blockAllMedia: boolean;
}

// These are optional for ReplayPluginOptions because the plugin sets default values
type OptionalReplayPluginOptions = Partial<ReplayPluginOptions>;

export interface ReplayConfiguration extends OptionalReplayPluginOptions, RecordingOptions {}

interface CommonEventContext {
  /**
   * The initial URL of the session
   */
  initialUrl: string;

  /**
   * The initial starting timestamp of the session
   */
  initialTimestamp: number;

  /**
   * Ordered list of URLs that have been visited during a replay segment
   */
  urls: string[];
}

export interface PopEventContext extends CommonEventContext {
  /**
   * List of Sentry error ids that have occurred during a replay segment
   */
  errorIds: Array<string>;

  /**
   * List of Sentry trace ids that have occurred during a replay segment
   */
  traceIds: Array<string>;
}

/**
 * Additional context that will be sent w/ `replay_event`
 */
export interface InternalEventContext extends CommonEventContext {
  /**
   * Set of Sentry error ids that have occurred during a replay segment
   */
  errorIds: Set<string>;

  /**
   * Set of Sentry trace ids that have occurred during a replay segment
   */
  traceIds: Set<string>;

  /**
   * The timestamp of the earliest event that has been added to event buffer. This can happen due to the Performance Observer which buffers events.
   */
  earliestEvent: number | null;
}
