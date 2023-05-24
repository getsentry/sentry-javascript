import type { customEvent } from '@sentry-internal/rrweb';
import type { Breadcrumb, FetchBreadcrumbData, XhrBreadcrumbData } from '@sentry/types';

import type { AllEntryData } from './performance';

interface BaseReplayFrame {
  timestamp: number;
  /**
   * For compatibility reasons
   */
  type: string;
  category: string;
  data?: Record<string, any>;
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

/* Crumbs from Core SDK */
interface ConsoleFrameData {
  logger: string;
  arguments?: any[];
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

/* Crumbs from Replay */
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

export type CrumbFrame =
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

export type ReplayFrame = CrumbFrame | SpanFrame;

export interface CrumbFrameEventData {
  tag: 'breadcrumb';
  payload: CrumbFrame;
}
export interface SpanFrameEventData {
  tag: 'performanceSpan';
  payload: SpanFrame;
}

export type CrumbFrameEvent = customEvent<CrumbFrameEventData>;
export type SpanFrameEvent = customEvent<SpanFrameEventData>;
export type ReplayFrameEvent = CrumbFrameEvent | SpanFrameEvent;
