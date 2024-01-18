export { Replay } from './integration';

export type {
  ReplayConfiguration,
  ReplayEventType,
  ReplayEventWithTime,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayOptionFrameEvent,
  ReplayFrame,
  ReplayFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
  CanvasManagerInterface,
  CanvasManagerOptions,
} from './types';

// TODO (v8): Remove deprecated types
export * from './types/deprecated';
