import type { Breadcrumb, FetchBreadcrumbData, XhrBreadcrumbData } from '@sentry/types';

import type { AllEntryData } from './performance';
import type { EventType } from './rrweb';

interface BaseReplayFrame {
  timestamp: number;
  /**
   * For compatibility reasons
   */
  type: string;
  category: string;
  data?: Record<string, unknown>;
  message?: string;
}

interface BaseDomFrameData {
  nodeId?: number;
  node?: {
    id: number;
    tagName: string;
    textContent: string;
    attributes: Record<string, unknown>;
  };
}

/* Breadcrumbs from Core SDK */
interface ConsoleFrameData {
  logger: string;
  arguments?: unknown[];
}
interface ConsoleFrame extends BaseReplayFrame {
  category: 'console';
  level: Breadcrumb['level'];
  message: string;
  data: ConsoleFrameData;
}

type ClickFrameData = BaseDomFrameData;
interface ClickFrame extends BaseReplayFrame {
  category: 'ui.click';
  message: string;
  data: ClickFrameData;
}

interface FetchFrame extends BaseReplayFrame {
  category: 'fetch';
  type: 'http';
  data: FetchBreadcrumbData;
}

interface InputFrame extends BaseReplayFrame {
  category: 'ui.input';
  message: string;
}

interface XhrFrame extends BaseReplayFrame {
  category: 'xhr';
  type: 'http';
  data: XhrBreadcrumbData;
}

/* Breadcrumbs from Replay */
interface MutationFrameData {
  count: number;
  limit: boolean;
}
interface MutationFrame extends BaseReplayFrame {
  category: 'replay.mutations';
  data: MutationFrameData;
}

interface KeyboardEventFrameData extends BaseDomFrameData {
  metaKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  key: string;
}
interface KeyboardEventFrame extends BaseReplayFrame {
  category: 'ui.keyDown';
  data: KeyboardEventFrameData;
}

interface BlurFrame extends BaseReplayFrame {
  category: 'ui.blur';
}

interface FocusFrame extends BaseReplayFrame {
  category: 'ui.focus';
}

interface SlowClickFrameData extends ClickFrameData {
  url: string;
  timeAfterClickFs: number;
  endReason: string;
}
interface SlowClickFrame extends BaseReplayFrame {
  category: 'ui.slowClickDetected';
  data: SlowClickFrameData;
}

interface OptionFrame {
  sessionSampleRate: number;
  errorSampleRate: number;
  useCompressionOption: boolean;
  blockAllMedia: boolean;
  maskAllText: boolean;
  maskAllInputs: boolean;
  useCompression: boolean;
  networkDetailHasUrls: boolean;
  networkCaptureBodies: boolean;
  networkRequestHasHeaders: boolean;
  networkResponseHasHeaders: boolean;
}

export type BreadcrumbFrame =
  | ConsoleFrame
  | ClickFrame
  | FetchFrame
  | InputFrame
  | XhrFrame
  | KeyboardEventFrame
  | BlurFrame
  | FocusFrame
  | SlowClickFrame
  | MutationFrame
  | BaseReplayFrame;

export interface SpanFrame {
  op: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  data: AllEntryData;
}

export type ReplayFrame = BreadcrumbFrame | SpanFrame;

interface RecordingCustomEvent {
  type: EventType.Custom;
  timestamp: number;
  data: {
    tag: string;
    payload: unknown;
  };
}

export interface BreadcrumbFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'breadcrumb';
    payload: BreadcrumbFrame;
    /**
     * This will indicate to backend to additionally log as a metric
     */
    metric?: boolean;
  };
}

export interface SpanFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'performanceSpan';
    payload: SpanFrame;
  };
}

export interface OptionFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'options';
    payload: OptionFrame;
  };
}

export type ReplayFrameEvent = BreadcrumbFrameEvent | SpanFrameEvent | OptionFrameEvent;
