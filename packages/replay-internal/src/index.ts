export { replayIntegration } from './integration';

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
  FetchHint,
  XhrHint,
} from './types';

export { getReplay } from './util/getReplay';
export { getBodyString } from './coreHandlers/util/networkUtils';
