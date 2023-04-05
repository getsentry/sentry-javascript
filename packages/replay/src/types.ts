import type {
  FetchBreadcrumbHint,
  HandlerDataFetch,
  ReplayRecordingData,
  ReplayRecordingMode,
  SentryWrappedXMLHttpRequest,
  XhrBreadcrumbHint,
} from '@sentry/types';

import type { eventWithTime, recordOptions } from './types/rrweb';

export type RecordingEvent = eventWithTime;
export type RecordingOptions = recordOptions;

export type AllPerformanceEntry = PerformancePaintTiming | PerformanceResourceTiming | PerformanceNavigationTiming;

export interface SendReplayData {
  recordingData: ReplayRecordingData;
  replayId: string;
  segmentId: number;
  includeReplayStartTimestamp: boolean;
  eventContext: PopEventContext;
  timestamp: number;
  session: Session;
  options: ReplayPluginOptions;
}

export interface Timeouts {
  sessionIdle: number;
  maxSessionLife: number;
}

/**
 * The request payload to worker
 */
export interface WorkerRequest {
  id: number;
  method: 'clear' | 'addEvent' | 'finish';
  arg?: string;
}

// PerformancePaintTiming and PerformanceNavigationTiming are only available with TS 4.4 and newer
// Therefore, we're exporting them here to make them available in older TS versions
export type PerformancePaintTiming = PerformanceEntry;
export type PerformanceNavigationTiming = PerformanceEntry &
  PerformanceResourceTiming & {
    type: string;
    transferSize: number;

    /**
     * A DOMHighResTimeStamp representing the time immediately before the user agent
     * sets the document's readyState to "interactive".
     */
    domInteractive: number;

    /**
     * A DOMHighResTimeStamp representing the time immediately before the current
     * document's DOMContentLoaded event handler starts.
     */
    domContentLoadedEventStart: number;
    /**
     * A DOMHighResTimeStamp representing the time immediately after the current
     * document's DOMContentLoaded event handler completes.
     */
    domContentLoadedEventEnd: number;

    /**
     * A DOMHighResTimeStamp representing the time immediately before the current
     * document's load event handler starts.
     */
    loadEventStart: number;

    /**
     * A DOMHighResTimeStamp representing the time immediately after the current
     * document's load event handler completes.
     */
    loadEventEnd: number;

    /**
     * A DOMHighResTimeStamp representing the time immediately before the user agent
     * sets the document's readyState to "complete".
     */
    domComplete: number;

    /**
     * A number representing the number of redirects since the last non-redirect
     * navigation in the current browsing context.
     */
    redirectCount: number;
  };
export type ExperimentalPerformanceResourceTiming = PerformanceResourceTiming & {
  // Experimental, see: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/responseStatus
  // Requires Chrome 109
  responseStatus?: number;
};

export type PaintData = undefined;

/**
 * See https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming
 *
 * Note `navigation.push` will not have any data
 */
export type NavigationData = Partial<
  Pick<
    PerformanceNavigationTiming,
    | 'decodedBodySize'
    | 'encodedBodySize'
    | 'duration'
    | 'domInteractive'
    | 'domContentLoadedEventEnd'
    | 'domContentLoadedEventStart'
    | 'loadEventStart'
    | 'loadEventEnd'
    | 'domComplete'
    | 'redirectCount'
  >
> & {
  /**
   * Transfer size of resource
   */
  size?: number;
};

export type ResourceData = Pick<PerformanceResourceTiming, 'decodedBodySize' | 'encodedBodySize'> & {
  /**
   * Transfer size of resource
   */
  size: number;
  /**
   * HTTP status code. Note this is experimental and not available on all browsers.
   */
  statusCode?: number;
};

export interface LargestContentfulPaintData {
  /**
   * Render time (in ms) of the LCP
   */
  value: number;
  size: number;
  /**
   * The recording id of the LCP node. -1 if not found
   */
  nodeId?: number;
}

/**
 * Entries that come from window.performance
 */
export type AllPerformanceEntryData = PaintData | NavigationData | ResourceData | LargestContentfulPaintData;

export interface MemoryData {
  memory: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
}

export interface NetworkRequestData {
  method?: string;
  statusCode?: number;
  requestBodySize?: number;
  responseBodySize?: number;
}

export interface HistoryData {
  previous: string;
}

export type AllEntryData = AllPerformanceEntryData | MemoryData | NetworkRequestData | HistoryData;

/**
 * The response from the worker
 */
export interface WorkerResponse {
  id: number;
  method: string;
  success: boolean;
  response: unknown;
}

export type AddEventResult = void;

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
   * Attempt to use compression when web workers are available
   *
   * (default is true)
   */
  useCompression: boolean;

  /**
   * Block all media (e.g. images, svg, video) in recordings.
   */
  blockAllMedia: boolean;

  /**
   * _experiments allows users to enable experimental or internal features.
   * We don't consider such features as part of the public API and hence we don't guarantee semver for them.
   * Experimental features can be added, changed or removed at any time.
   *
   * Default: undefined
   */
  _experiments: Partial<{
    captureExceptions: boolean;
    traceInternals: boolean;
    mutationLimit: number;
    mutationBreadcrumbLimit: number;
    captureNetworkBodies: boolean;
  }>;
}

export interface ReplayIntegrationPrivacyOptions {
  /**
   * Mask text content for elements that match the CSS selectors in the list.
   */
  mask?: string[];

  /**
   * Unmask text content for elements that match the CSS selectors in the list.
   */
  unmask?: string[];

  /**
   * Block elements that match the CSS selectors in the list. Blocking replaces
   * the element with an empty placeholder with the same dimensions.
   */
  block?: string[];

  /**
   * Unblock elements that match the CSS selectors in the list. This is useful when using `blockAllMedia`.
   */
  unblock?: string[];

  /**
   * Ignore input events for elements that match the CSS selectors in the list.
   */
  ignore?: string[];

  /**
   * A callback function to customize how your text is masked.
   */
  maskFn?: Pick<RecordingOptions, 'maskTextFn'>;
}

// These are optional for ReplayPluginOptions because the plugin sets default values
type OptionalReplayPluginOptions = Partial<ReplayPluginOptions>;

export interface DeprecatedPrivacyOptions {
  /**
   * @deprecated Use `block` which accepts an array of CSS selectors
   */
  blockSelector?: RecordingOptions['blockSelector'];
  /**
   * @deprecated Use `block` which accepts an array of CSS selectors
   */
  blockClass?: RecordingOptions['blockClass'];
  /**
   * @deprecated Use `ignore` which accepts an array of CSS selectors
   */
  ignoreClass?: RecordingOptions['ignoreClass'];
  /**
   * @deprecated  Use `mask` which accepts an array of CSS selectors
   */
  maskInputOptions?: RecordingOptions['maskInputOptions'];
  /**
   * @deprecated Use `mask` which accepts an array of CSS selectors
   */
  maskTextClass?: RecordingOptions['maskTextClass'];
  /**
   * @deprecated Use `mask` which accepts an array of CSS selectors
   */
  maskTextSelector?: RecordingOptions['maskTextSelector'];
}

export interface ReplayConfiguration
  extends ReplayIntegrationPrivacyOptions,
    OptionalReplayPluginOptions,
    DeprecatedPrivacyOptions,
    Pick<RecordingOptions, 'maskAllText' | 'maskAllInputs'> {}

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

export type Sampled = false | 'session' | 'error';

export interface Session {
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
   * The ID of the previous session.
   * If this is empty, there was no previous session.
   */
  previousSessionId?: string;

  /**
   * Is the session sampled? `false` if not sampled, otherwise, `session` or `error`
   */
  sampled: Sampled;
}

export interface EventBuffer {
  /**
   * If any events have been added to the buffer.
   */
  readonly hasEvents: boolean;

  /**
   * Destroy the event buffer.
   */
  destroy(): void;

  /**
   * Add an event to the event buffer.
   * `isCheckout` is true if this is either the very first event, or an event triggered by `checkoutEveryNms`.
   *
   * Returns a promise that resolves if the event was successfully added, else rejects.
   */
  addEvent(event: RecordingEvent, isCheckout?: boolean): Promise<AddEventResult>;

  /**
   * Clears and returns the contents of the buffer.
   */
  finish(): Promise<ReplayRecordingData>;
}

export type AddUpdateCallback = () => boolean | void;

export interface ReplayContainer {
  eventBuffer: EventBuffer | null;
  performanceEvents: AllPerformanceEntry[];
  session: Session | undefined;
  recordingMode: ReplayRecordingMode;
  timeouts: {
    sessionIdle: number;
    maxSessionLife: number;
  };
  isEnabled(): boolean;
  isPaused(): boolean;
  getContext(): InternalEventContext;
  start(): void;
  stop(reason?: string): Promise<void>;
  pause(): void;
  resume(): void;
  startRecording(): void;
  stopRecording(): boolean;
  flushImmediate(): void;
  triggerUserActivity(): void;
  addUpdate(cb: AddUpdateCallback): void;
  getOptions(): ReplayPluginOptions;
  getSessionId(): string | undefined;
  checkAndHandleExpiredSession(): boolean | void;
  setInitialState(): void;
}

export interface ReplayPerformanceEntry<T> {
  /**
   * One of these types https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry/entryType
   */
  type: string;

  /**
   * A more specific description of the performance entry
   */
  name: string;

  /**
   * The start timestamp in seconds
   */
  start: number;

  /**
   * The end timestamp in seconds
   */
  end: number;

  /**
   * Additional unstructured data to be included
   */
  data: T;
}

type RequestBody = null | Blob | BufferSource | FormData | URLSearchParams | string;

export type XhrHint = XhrBreadcrumbHint & {
  xhr: XMLHttpRequest & SentryWrappedXMLHttpRequest;
  input?: RequestBody;
};
export type FetchHint = FetchBreadcrumbHint & {
  input: HandlerDataFetch['args'];
  response: Response;
};

export type NetworkBody = Record<string, unknown> | string;

type NetworkMetaError = 'MAX_BODY_SIZE_EXCEEDED';

interface NetworkMeta {
  errors?: NetworkMetaError[];
}

export interface ReplayNetworkRequestOrResponse {
  size?: number;
  body?: NetworkBody;
  _meta?: NetworkMeta;
}

export type ReplayNetworkRequestData = {
  startTimestamp: number;
  endTimestamp: number;
  url: string;
  method?: string;
  statusCode: number;
  request?: ReplayNetworkRequestOrResponse;
  response?: ReplayNetworkRequestOrResponse;
};
