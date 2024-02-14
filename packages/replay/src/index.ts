export {
  // eslint-disable-next-line deprecation/deprecation
  Replay,
  replayIntegration,
} from './integration';

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

export { getReplay } from './util/getReplay';

// TODO (v8): Remove deprecated types
export * from './types/deprecated';
