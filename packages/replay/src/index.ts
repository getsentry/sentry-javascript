import {
  getReplay as internalGetReplay,
  replayIntegration as internalReplayIntegration,
} from '@sentry-internal/replay';
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
} from '@sentry-internal/replay';

/** @deprecated Import from `@sentry-internal/replay` */
export const getReplay = internalGetReplay;

/** @deprecated Import from `@sentry-internal/replay` */
export const replayIntegration = internalReplayIntegration;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayConfiguration = InternalReplayConfiguration;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayEventType = InternalReplayEventType;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayEventWithTime = InternalReplayEventWithTime;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayBreadcrumbFrame = InternalReplayBreadcrumbFrame;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayBreadcrumbFrameEvent = InternalReplayBreadcrumbFrameEvent;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayOptionFrameEvent = InternalReplayOptionFrameEvent;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayFrame = InternalReplayFrame;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplayFrameEvent = InternalReplayFrameEvent;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplaySpanFrame = InternalReplaySpanFrame;

/** @deprecated Import from `@sentry-internal/replay` */
export type ReplaySpanFrameEvent = InternalReplaySpanFrameEvent;

/** @deprecated Import from `@sentry-internal/replay` */
export type CanvasManagerInterface = InternalCanvasManagerInterface;

/** @deprecated Import from `@sentry-internal/replay` */
export type CanvasManagerOptions = InternalCanvasManagerOptions;
