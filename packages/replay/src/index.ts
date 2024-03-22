// eslint-disable-next-line deprecation/deprecation
import { Replay as InternalReplay, replayIntegration as internalReplayIntegration } from './integration';
import type {
  CanvasManagerInterface as InternalCanvasManagerInterface,
  CanvasManagerOptions as InternalCanvasManagerOptions,
  ReplayBreadcrumbFrame as InternalReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent as InternalReplayBreadcrumbFrameEvent,
  ReplayConfiguration as InternalReplayConfiguration,
  ReplayEventType as InternalReplayEventType,
  ReplayEventWithTime as InternalReplayEventWithTime,
  ReplayFrame as InternalReplayFrame,
  ReplayFrameEvent as InternalReplayFrameEvent,
  ReplayOptionFrameEvent as InternalReplayOptionFrameEvent,
  ReplaySpanFrame as InternalReplaySpanFrame,
  ReplaySpanFrameEvent as InternalReplaySpanFrameEvent,
} from './types';
import { getReplay as internalGetReplay } from './util/getReplay';

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
const getReplay = internalGetReplay;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
const replayIntegration = internalReplayIntegration;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
// eslint-disable-next-line deprecation/deprecation
class Replay extends InternalReplay {}

// eslint-disable-next-line deprecation/deprecation
export { replayIntegration, getReplay, Replay, internalReplayIntegration, internalGetReplay, InternalReplay };

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayConfiguration = InternalReplayConfiguration;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayEventType = InternalReplayEventType;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayEventWithTime = InternalReplayEventWithTime;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayBreadcrumbFrame = InternalReplayBreadcrumbFrame;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayBreadcrumbFrameEvent = InternalReplayBreadcrumbFrameEvent;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayOptionFrameEvent = InternalReplayOptionFrameEvent;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayFrame = InternalReplayFrame;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplayFrameEvent = InternalReplayFrameEvent;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplaySpanFrame = InternalReplaySpanFrame;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type ReplaySpanFrameEvent = InternalReplaySpanFrameEvent;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type CanvasManagerInterface = InternalCanvasManagerInterface;

/** @deprecated Use the export from `@sentry/replay` or from framework-specific SDKs like `@sentry/react` or `@sentry/vue` */
type CanvasManagerOptions = InternalCanvasManagerOptions;

export type {
  // eslint-disable-next-line deprecation/deprecation
  CanvasManagerInterface,
  // eslint-disable-next-line deprecation/deprecation
  CanvasManagerOptions,
  // eslint-disable-next-line deprecation/deprecation
  ReplayBreadcrumbFrame,
  // eslint-disable-next-line deprecation/deprecation
  ReplayBreadcrumbFrameEvent,
  // eslint-disable-next-line deprecation/deprecation
  ReplayConfiguration,
  // eslint-disable-next-line deprecation/deprecation
  ReplayEventType,
  // eslint-disable-next-line deprecation/deprecation
  ReplayEventWithTime,
  // eslint-disable-next-line deprecation/deprecation
  ReplayFrame,
  // eslint-disable-next-line deprecation/deprecation
  ReplayFrameEvent,
  // eslint-disable-next-line deprecation/deprecation
  ReplayOptionFrameEvent,
  // eslint-disable-next-line deprecation/deprecation
  ReplaySpanFrame,
  // eslint-disable-next-line deprecation/deprecation
  ReplaySpanFrameEvent,
  InternalCanvasManagerInterface,
  InternalCanvasManagerOptions,
  InternalReplayBreadcrumbFrame,
  InternalReplayBreadcrumbFrameEvent,
  InternalReplayConfiguration,
  InternalReplayEventType,
  InternalReplayEventWithTime,
  InternalReplayFrame,
  InternalReplayFrameEvent,
  InternalReplayOptionFrameEvent,
  InternalReplaySpanFrame,
  InternalReplaySpanFrameEvent,
};

// TODO (v8): Remove deprecated types
export * from './types/deprecated';
