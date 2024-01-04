export { Replay } from './integration';
export { ReplayCanvas } from './canvas';

export type {
  ReplayEventType,
  ReplayEventWithTime,
  ReplayBreadcrumbFrame,
  ReplayBreadcrumbFrameEvent,
  ReplayOptionFrameEvent,
  ReplayFrame,
  ReplayFrameEvent,
  ReplaySpanFrame,
  ReplaySpanFrameEvent,
} from './types';

// TODO (v8): Remove deprecated types
export * from './types/deprecated';
